import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import {
  Document,
  DocumentDocument,
} from '../documents/schemas/document.schema';

type DocumentTypeBreakdown = {
  type: string;
  count: number;
  percentage: number;
};

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(Document.name)
    private readonly documentModel: Model<DocumentDocument>,
  ) {}

  async getSummary() {
    const [result] = await this.documentModel.aggregate([
      {
        $facet: {
          statusDistribution: [
            {
              $group: {
                _id: '$status',
                count: { $sum: 1 },
              },
            },
          ],

          documentTypeBreakdown: [
            {
              $match: {
                documentType: {
                  $in: ['INVOICE', 'ID_CARD', 'CONTRACT'],
                },
              },
            },
            {
              $group: {
                _id: '$documentType',
                count: { $sum: 1 },
              },
            },
          ],

          totalDocuments: [
            {
              $count: 'total',
            },
          ],
        },
      },

      {
        $project: {
          statusDistribution: 1,
          documentTypeBreakdown: 1,
          totalDocuments: {
            $arrayElemAt: ['$totalDocuments.total', 0],
          },
        },
      },

      {
        $unwind: {
          path: '$documentTypeBreakdown',
          preserveNullAndEmptyArrays: true,
        },
      },

      {
        $project: {
          statusDistribution: 1,
          documentTypeBreakdown: {
            type: '$documentTypeBreakdown._id',
            count: '$documentTypeBreakdown.count',
            percentage: {
              $cond: [
                {
                  $gt: ['$totalDocuments', 0],
                },
                {
                  $multiply: [
                    {
                      $divide: [
                        '$documentTypeBreakdown.count',
                        '$totalDocuments',
                      ],
                    },
                    100,
                  ],
                },
                0,
              ],
            },
          },
        },
      },

      {
        $group: {
          _id: null,
          statusDistribution: {
            $first: '$statusDistribution',
          },
          documentTypeBreakdown: {
            $push: '$documentTypeBreakdown',
          },
        },
      },

      {
        $project: {
          _id: 0,
          statusDistribution: 1,
          documentTypeBreakdown: 1,
        },
      },
    ]);

    return (
      result ?? {
        statusDistribution: [],
        documentTypeBreakdown: [],
      }
    );
  }
}