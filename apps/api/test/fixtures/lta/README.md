# LTA DataMall fixtures

Tests read these files instead of calling LTA. Each file is `{ recordedAt, body }`, where `body` is exactly what LTA returned.

| File                          | What it covers                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| `bus-arrival-83139-day.json`  | Recorded. A suburban stop with three services, all with three buses.                 |
| `bus-arrival-01012-city.json` | Recorded. A city stop with 11 services; 12e and 32 have empty `NextBus2`/`NextBus3`. |
| `bus-arrival-night.json`      | Constructed from the API guide: no buses in service, so `Services` is empty.         |
| `bus-stops-first-page.json`   | Recorded. The first 25 records of `BusStops` (LTA pages these 500 at a time).        |

To record a new one (needs `LTA_ACCOUNT_KEY` in `apps/api/.env`; the key is never written to the file):

```bash
npm run fixture:record -w apps/api -- arrival 83139 day
npm run fixture:record -w apps/api -- stops first-page 25
```
