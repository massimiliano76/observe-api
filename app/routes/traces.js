import Joi from '@hapi/joi';
import traces from '../models/traces';
import logger from '../services/logger';
import db from '../services/db';
import Boom from '@hapi/boom';

/**
 * @api {post} /traces POST
 * @apiGroup traces
 * @apiDescription Upload a trace.
 *
 * @apiParam {object} [tracejson] TraceJSON object.
 *
 * @apiSuccess {object}   tracejson       TraceJSON object, with properties populated with id, timestamps and description.
 *
 * @apiError statusCode     The error code
 * @apiError error          Error name
 * @apiError message        Error message
 * @apiErrorExample {json} Error Response:
 *     HTTP/1.1 400 Bad Request
 *     {
 *      "statusCode": 400,
 *      "error": "Bad Request",
 *      "message": "Oops!"
 *     }
 */
module.exports = [
  {
    path: '/traces',
    method: ['POST'],
    options: {
      auth: 'jwt',
      validate: {
        payload: Joi.object({
          tracejson: Joi.object({
            type: Joi.valid('Feature'),
            properties: Joi.object({
              description: Joi.string(),
              timestamps: Joi.array()
                .min(1)
                .items(Joi.number())
            }).required(),
            geometry: Joi.object({
              type: Joi.valid('LineString'),
              coordinates: Joi.array()
                .min(1)
                .items(
                  Joi.array().ordered(
                    Joi.number()
                      .min(-90)
                      .max(90)
                      .required(),
                    Joi.number()
                      .min(-180)
                      .max(180)
                      .required()
                  )
                )
            }).required()
          })
            .custom(value => {
              // Check if number of timestamps matches number of points in trace.
              const {
                properties: { timestamps },
                geometry: { coordinates }
              } = value;
              if (timestamps.length !== coordinates.length) {
                throw new Error(
                  'number of timestamps and points does not match.'
                );
              }
              return value;
            })
            .required()
        })
      },
      handler: async function (request) {
        try {
          // Get user id
          const {
            credentials: { osmId }
          } = request.auth;

          // Get properties from TraceJson
          const { tracejson } = request.payload;
          const {
            geometry: { coordinates },
            properties: { timestamps, description }
          } = tracejson;

          // Transform GeoJSON feature to WKT
          const wkt = `LINESTRING (${coordinates
            .map(p => p.join(' '))
            .join(',')})`;

          // Insert trace
          const [trace] = await traces
            .create({
              creatorId: osmId,
              description,
              geometry: wkt,
              length: db.raw(`ST_Length(
                ST_GeogFromText('SRID=4326;${wkt}'),true)
              `),
              timestamps,
              recordedAt: new Date(timestamps[0])
            })
            .returning([
              'id',
              'creatorId',
              'description',
              'length',
              'recordedAt',
              'uploadedAt',
              'updatedAt',
              'timestamps',
              db.raw('ST_AsGeoJSON(geometry) as geometry')
            ]);

          // Return as TraceJSON
          return {
            type: 'Feature',
            properties: {
              id: trace.id,
              creatorId: trace.creatorId,
              description: trace.description,
              length: trace.length,
              recordedAt: trace.recordedAt,
              uploadedAt: trace.uploadedAt,
              updatedAt: trace.updatedAt,
              timestamps: trace.timestamps
            },
            geometry: JSON.parse(trace.geometry)
          };
        } catch (error) {
          logger.error(error);
          return Boom.badImplementation('Unexpected error.');
        }
      }
    }
  }
];
