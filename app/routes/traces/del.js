import Boom from '@hapi/boom';
import config from 'config';
import Joi from '@hapi/joi';
import logger from '../../services/logger';
import { getTrace, deleteTrace } from '../../models/traces';

const elementIds = config.get('elementIds');

/**
 * @apiGroup Traces
 *
 * @api {del} /traces/:id 3. DEL /traces/:id
 * @apiDescription Delete trace, must be owner or admin.
 *
 * @apiParam {string} id Trace id.
 *
 * @apiUse AuthorizationHeader
 * @apiUse Success200
 * @apiUse Error4xx
 */
export default [
  {
    path: '/traces/{id}',
    method: ['DELETE'],
    options: {
      auth: 'jwt',
      validate: {
        params: Joi.object({
          id: Joi.string().length(elementIds.length)
        })
      },
      handler: async function (request) {
        try {
          // Get trace
          const { id } = request.params;
          const trace = await getTrace(id);

          if (!trace) return Boom.notFound('Trace not found.');

          // Verify ownership
          const { osmId, isAdmin } = request.auth.credentials;
          if (trace.ownerId !== osmId && !isAdmin) {
            return Boom.forbidden('Must be owner or admin to edit a trace.');
          }

          // Perform delete
          await deleteTrace(id);

          // Return empty response
          return {};
        } catch (error) {
          logger.error(error);
          return Boom.badImplementation('Unexpected error.');
        }
      }
    }
  }
];
