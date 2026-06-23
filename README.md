# Smart Wagons Brake Monitoring Dashboard

Live web dashboard for Smart Wagons brake binding monitoring using Supabase realtime data.

## Setup

1. Copy `.env.example` to `.env`.
2. `VITE_PRESSURE_TABLE` should be `bpc_pressure`.
3. `VITE_DEVICE_TABLE` should be `coaches_railway`.
4. Set `VITE_OFFLINE_AFTER_SECONDS`. Since your device sends every second, `5` is a good first value.
5. Run:

```bash
npm install
npm run dev
```

## Supabase Columns

The dashboard reads `bpc_pressure` for live readings and `coaches_railway` for device metadata. It accepts several common column names automatically:

- Device ID: `device_id`, `deviceId`, `device`
- Officer-facing device ID: `Actual_id`, `actual_id`
- Wagon ID: `wagon_id`, `wagonId`, `coach`, `coach_no`, `coach_id`
- Train number: `train_no`, `train_number`, `train`
- Pressure values: `bp`, `fp`, `cr`, `bc`
- Timestamp: `created_at`, `timestamp`, `time`
- Location: `location`

Old `coach` data is displayed as `Wagon` in the UI.

## Brake Logic

- Device off/raw zero: BP 0, FP 0, CR 0, BC 0
- Idle: BP 5, FP 6, CR 5, BC 0
- Brake applied: BP 0, FP 6, CR 5, BC 3 or 3.1
- Brake released: BP 5, FP 6, CR 5, BC 0 or 0.4
- CR overcharge/overheating: CR greater than 5

## Deployment

This is ready for Vercel or Netlify. Add the environment variables in the hosting dashboard.
