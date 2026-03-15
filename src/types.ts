export interface Player {
  id: string;
  name: string;
  photo?: string;
  goals: number;
  isPlayerOfWeek: boolean;
  payments: { [month: string]: boolean }; // e.g., "2024-03": true
}

export type Month = string; // YYYY-MM
