import { type INestApplication, ValidationPipe } from '@nestjs/common';

/** Cấu hình dùng chung cho main.ts và test, để test chạy đúng pipeline của production. */
export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // bỏ field lạ
      forbidNonWhitelisted: true, // và báo lỗi 400 nếu có field lạ
      transform: true, // body thành instance của DTO
    }),
  );
}
