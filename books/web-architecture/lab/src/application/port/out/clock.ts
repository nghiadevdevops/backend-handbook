/** Secondary port: core chỉ lấy "bây giờ" qua đây. */
export interface Clock {
  now(): Date;
}
