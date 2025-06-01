export interface ChartData {
  title: string
  labels: string[]
  datasets: ChartDataset[]
}

interface ChartDataset {
  label: string
  data: number[]
  backgroundColor: string[]
  grouped?: boolean | undefined
  hidden?: boolean | undefined
}

export interface ApiMeta {
  activity: number
  all_emotes: number
  emotes: ApiEmote[]
}

export interface ApiEmote {
  id: string
  text: string
  source: string
  total: number
}

export interface ApiChart {
  period: number
  emotes?: number[] | undefined
  lines: number[]
  chatters: number[]
}

export interface ApiHighlight {
  start: number
  end: number
  peak: number
}
