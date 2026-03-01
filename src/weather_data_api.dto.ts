// -------------------------------------------------------
// Auto-generated DTOs from OpenAPI spec
// Source: openapi.yaml
// Generated: 2026-03-01T11:40:36.069Z
// -------------------------------------------------------

import { IsString, IsNumber, IsBoolean, IsOptional, IsDateString } from 'class-validator';

export class CurrentWeatherResponse {
  @IsOptional()
  location?: Location;

  @IsNumber()
  @IsOptional()
  temperature?: number;

  @IsNumber()
  @IsOptional()
  humidity?: number;

  @IsNumber()
  @IsOptional()
  windSpeed?: number;

  @IsString()
  @IsOptional()
  condition?: string;

  @IsString()
  @IsOptional()
  observationTime?: Date | string;

}

export class DailyForecastResponse {
  @IsOptional()
  location?: Location;

  @IsOptional()
  forecasts?: DailyForecast[];

}

export class HistoricalWeatherResponse {
  @IsOptional()
  location?: Location;

  @IsOptional()
  observations?: HistoricalObservation[];

}

export class WeatherAlertResponse {
  @IsOptional()
  alerts?: WeatherAlert[];

}

export class Location {
  @IsNumber()
  @IsOptional()
  latitude?: number;

  @IsNumber()
  @IsOptional()
  longitude?: number;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  country?: string;

}

export class DailyForecast {
  @IsString()
  @IsOptional()
  date?: Date | string;

  @IsNumber()
  @IsOptional()
  minTemp?: number;

  @IsNumber()
  @IsOptional()
  maxTemp?: number;

  @IsString()
  @IsOptional()
  condition?: string;

}

export class HistoricalObservation {
  @IsString()
  @IsOptional()
  date?: Date | string;

  @IsNumber()
  @IsOptional()
  temperature?: number;

  @IsNumber()
  @IsOptional()
  precipitation?: number;

}

export class WeatherAlert {
  @IsString()
  @IsOptional()
  type?: string;

  @IsOptional()
  severity?: "minor" | "moderate" | "severe" | "extreme";

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  effectiveFrom?: Date | string;

  @IsString()
  @IsOptional()
  expiresAt?: Date | string;

}

export class ErrorResponse {
  @IsString()
  @IsOptional()
  timestamp?: Date | string;

  @IsNumber()
  @IsOptional()
  status?: number;

  @IsString()
  @IsOptional()
  errorCode?: string;

  @IsString()
  @IsOptional()
  message?: string;

  @IsString()
  @IsOptional()
  traceId?: string;

}

