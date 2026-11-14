/** Entity (định danh: room_id). Aggregate root riêng. */
export interface Room {
  readonly room_id: string;
  readonly name: string;
  readonly capacity: number;
}
