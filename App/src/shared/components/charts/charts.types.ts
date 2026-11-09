import type { ReactNode } from 'react'

export interface ChartSeriesPoint {
  id: string
  label: string
  value: number
  secondaryValue?: number
  overlays?: Record<string, number>
  meta?: string
}

export interface ChartOverlaySeries {
  id: string
  label: string
  color: string
}

export interface ChartCategoryItem {
  id: string
  label: string
  value: number
  color?: string
  meta?: string
}

export interface ChartCapacityItem {
  id: string
  label: string
  subtitle?: string
  value: number
  capacity?: number | null
  meta?: string
}

export interface ChartInteractionPayload {
  id: string
  label: string
  value: number
}

export type ChartEmptyContent = ReactNode
