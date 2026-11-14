import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { BookshopModule } from './bookshop.module.js';
import { configureApp } from './configure-app.js';

const app = await NestFactory.create(BookshopModule);
configureApp(app);
app.enableShutdownHooks();
await app.listen(Number(process.env['PORT'] ?? 3000));
