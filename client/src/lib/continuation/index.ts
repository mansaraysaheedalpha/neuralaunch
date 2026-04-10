// src/lib/continuation/index.ts
//
// Public API for the continuation module. Nothing outside this
// directory should import from internal files directly — the barrel
// is the contract surface.

export {
  CONTINUATION_BRIEF_EVENT,
  CONTINUATION_THRESHOLDS,
  CONTINUATION_STATUSES,
  PARKING_LOT_MAX_ITEMS,
  PARKING_LOT_IDEA_MAX_LENGTH,
  DIAGNOSTIC_HARD_CAP_TURNS,
} from './constants';
export type { ContinuationStatus } from './constants';

export type {
  ParkingLotItem,
  ParkingLot,
  ParkingLotSource,
  AppendOutcome,
} from './parking-lot-schema';
export {
  PARKING_LOT_SOURCES,
  ParkingLotItemSchema,
  ParkingLotArraySchema,
  safeParseParkingLot,
  buildParkingLotItem,
  appendParkingLotItem,
  captureParkingLotFromCheckin,
} from './parking-lot-schema';
