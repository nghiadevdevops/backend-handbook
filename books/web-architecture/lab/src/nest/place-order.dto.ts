import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Kiểm tra HÌNH DẠNG dữ liệu vào. Luật nghiệp vụ (đã sở hữu chưa...) nằm ở core. */
export class PlaceOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(64, { each: true })
  ebookIds!: string[];
}
