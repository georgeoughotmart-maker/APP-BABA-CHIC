export interface Player {
  id: string;
  name: string;
  photo?: string;
  goals: number;
  isPlayerOfWeek: boolean;
  playerOfWeekCount: number;
  playerOfWeekPhoto?: string;
  payments: { [month: string]: boolean | 'exempt' }; // true: paid, false: unpaid, 'exempt': exempt
}

export type Month = string; // YYYY-MM
