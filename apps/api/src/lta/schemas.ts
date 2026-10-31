import { z } from 'zod';

/**
 * Raw LTA DataMall shapes (API User Guide v6.10). LTA sends empty strings rather than nulls for
 * missing values, e.g. NextBus3 when only one bus is left on the road.
 */
export const ltaNextBusSchema = z.object({
  OriginCode: z.string(),
  DestinationCode: z.string(),
  EstimatedArrival: z.string(),
  Monitored: z.number().optional(),
  Latitude: z.string(),
  Longitude: z.string(),
  VisitNumber: z.string(),
  Load: z.string(),
  Feature: z.string(),
  Type: z.string(),
});

export const ltaServiceSchema = z.object({
  ServiceNo: z.string(),
  Operator: z.string(),
  NextBus: ltaNextBusSchema,
  NextBus2: ltaNextBusSchema,
  NextBus3: ltaNextBusSchema,
});

export const ltaBusArrivalSchema = z.object({
  BusStopCode: z.string(),
  Services: z.array(ltaServiceSchema),
});

export const ltaBusStopSchema = z.object({
  BusStopCode: z.string(),
  RoadName: z.string(),
  Description: z.string(),
  Latitude: z.number(),
  Longitude: z.number(),
});

export const ltaBusStopsPageSchema = z.object({
  value: z.array(ltaBusStopSchema),
});

export type LtaNextBus = z.infer<typeof ltaNextBusSchema>;
export type LtaService = z.infer<typeof ltaServiceSchema>;
export type LtaBusArrival = z.infer<typeof ltaBusArrivalSchema>;
export type LtaBusStop = z.infer<typeof ltaBusStopSchema>;
