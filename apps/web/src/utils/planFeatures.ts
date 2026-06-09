const LS_KEY = 'quetxal_plan_features'

export function getPlanFeatures(planId: number | string, fallback: string[]): string[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return fallback
    const map = JSON.parse(raw) as Record<string, string[]>
    return map[String(planId)] ?? fallback
  } catch {
    return fallback
  }
}

export function setPlanFeatures(planId: number | string, features: string[]): void {
  try {
    const raw = localStorage.getItem(LS_KEY)
    const map: Record<string, string[]> = raw ? JSON.parse(raw) : {}
    map[String(planId)] = features
    localStorage.setItem(LS_KEY, JSON.stringify(map))
  } catch {}
}
