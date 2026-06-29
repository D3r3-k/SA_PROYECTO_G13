import numpy as np


def get_recommendations(
    watch_history: list[dict],
    catalog: list[dict],
    limit: int = 10,
) -> list[dict]:
    if not watch_history or not catalog or limit <= 0:
        return []

    all_genres: set[str] = set()
    for item in watch_history:
        all_genres.update(item.get("genres", []))
    for item in catalog:
        all_genres.update(item.get("genres", []))

    if not all_genres:
        return []

    vocabulary = sorted(all_genres)
    genre_index = {g: i for i, g in enumerate(vocabulary)}

    def _vectorize(genres: list[str]) -> np.ndarray:
        vec = np.zeros(len(vocabulary))
        for g in genres:
            if g in genre_index:
                vec[genre_index[g]] = 1.0
        return vec

    profile = np.zeros(len(vocabulary))
    for item in watch_history:
        weight = 1.0 if item.get("rating", True) else -1.0
        profile += weight * _vectorize(item.get("genres", []))

    profile_norm = np.linalg.norm(profile)
    if profile_norm == 0.0:
        return []

    seen_ids = {item["content_id"] for item in watch_history}
    candidates = [item for item in catalog if item["content_id"] not in seen_ids]
    if not candidates:
        return []

    catalog_matrix = np.array([_vectorize(item.get("genres", [])) for item in candidates])

    catalog_norms = np.linalg.norm(catalog_matrix, axis=1)
    scores = np.zeros(len(candidates))
    valid = catalog_norms > 0.0
    scores[valid] = (catalog_matrix[valid] @ profile) / (catalog_norms[valid] * profile_norm)

    ranked = np.argsort(scores)[::-1]
    results = []
    for idx in ranked:
        if scores[idx] <= 0.0 or len(results) >= limit:
            break
        item = candidates[int(idx)]
        results.append({
            "content_id": item["content_id"],
            "title": item["title"],
            "genres": item.get("genres", []),
        })

    return results
