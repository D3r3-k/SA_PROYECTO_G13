import api from './api'

export interface RecommendedContent {
  content_id: string
  title: string
  genres: string[]
}

export interface GetRecommendationsResponse {
  success: boolean
  message: string
  items: RecommendedContent[]
}

export const recommendationService = {
  getRecommendations: (limit = 10) =>
    api.get<GetRecommendationsResponse>('/recommendations', { params: { limit } }),
}
