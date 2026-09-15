import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MongooseModule } from '@nestjs/mongoose';
import { EventsModule } from './events/events.module';
import { DocumentsModule } from './documents/documents.module';
import { ReportsModule } from './reports/reports.module';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    MongooseModule.forRoot(
      process.env.MONGODB_URI ??
        'mongodb://localhost:27017/processing-events',
    ),
    EventsModule,
    DocumentsModule,
    ReportsModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
