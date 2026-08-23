import pool from '../config/db.js';
import * as historyRepository from '../repositories/historyRepository.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Thin wrapper over historyRepository.insertAuditLog, always called with a
 * `client` from an existing withTransaction block in the service that
 * caused the event - so a history entry rolls back with the state change
 * it describes, and GET requests never produce history entries.
 */
export async function recordEvent(client, { tripId, actorMemberId, entityType, entityId, action, metadata }) {
  return historyRepository.insertAuditLog(client, {
    tripId,
    actorMemberId,
    entityType,
    entityId,
    action,
    metadata: metadata ?? null,
  });
}

function parsePagination(query = {}) {
  let page = parseInt(query.page, 10);
  let limit = parseInt(query.limit, 10);

  if (!Number.isInteger(page) || page < 1) page = 1;
  if (!Number.isInteger(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  return { page, limit, offset: (page - 1) * limit };
}

export async function listHistory(tripId, query) {
  const { page, limit, offset } = parsePagination(query);

  const [events, total] = await Promise.all([
    historyRepository.listHistoryForTrip(pool, tripId, { limit, offset }),
    historyRepository.countHistoryForTrip(pool, tripId),
  ]);

  return {
    events,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}
