import config from 'config';
import Bell from '@hapi/bell';
import { xml2js } from 'xml-js';
import logger from '../logger';
import users from '../../models/users';
import { getAccessToken } from './jwt';

// Get OAuth settings
const {
  clientSecret,
  clientId,
  requestTokenUrl,
  accessTokenUrl,
  authorizeUrl,
  profileUrl
} = config.get('osmOAuth');

/**
 * Setup OAuth provider for hapi-bell.
 *
 * @param {object} server
 */
async function setupOAuth (server) {
  // Add a simulated provider for testing
  if (process.env.NODE_ENV === 'test') {
    Bell.simulate(async req => {
      const { osmId } = req.query;

      const accessToken = await getAccessToken(parseInt(osmId));

      return { accessToken };
    });
  }

  // Register Bell
  await server.register(Bell);

  // Client to get profile as raw XML
  const oauthClient = new Bell.oauth.Client({
    name: 'osm',
    provider: {
      protocol: 'oauth',
      signatureMethod: 'HMAC-SHA1',
      temporary: requestTokenUrl,
      token: accessTokenUrl,
      auth: authorizeUrl
    },
    clientId,
    clientSecret
  });

  const osmStrategy = {
    protocol: 'oauth',
    temporary: requestTokenUrl,
    token: accessTokenUrl,
    auth: authorizeUrl,
    profile: async credentials => {
      let profile;

      // Get and parse user profile XML
      try {
        const { payload } = await oauthClient.resource(
          'GET',
          profileUrl,
          null,
          {
            token: credentials.token,
            secret: credentials.secret,
            raw: true
          }
        );
        profile = xml2js(payload).elements[0].elements[0].attributes;
        profile.id = parseInt(profile.id);
      } catch (error) {
        logger.error(error);
        throw Error('Could not get user profile from OpenStreetMap.');
      }

      // Retrieve user from database
      let [user] = await users.findByOsmId(profile.id);

      // Upsert user
      if (!user) {
        // Create new user, if none found
        user = await users
          .create({
            osmId: profile.id,
            osmDisplayName: profile.display_name,
            osmCreatedAt: profile.account_created
          })
          .returning('*');
      } else {
        // Update display name of existing user, if it has changed in OSM.
        if (user.osmDisplayName !== profile.display_name) {
          user = await users
            .updateFromOsmId(profile.id, {
              osmDisplayName: profile.display_name
            })
            .returning('*');
        }
      }

      credentials.profile = {
        osmId: user.osmId,
        osmDisplayName: user.osmDisplayName,
        osmCreatedAt: user.osmCreatedAt.toISOString()
      };
      credentials.accessToken = await getAccessToken(profile.id);

      return credentials;
    }
  };

  // Add custom OSM strategy
  server.auth.strategy('openstreetmap', 'bell', {
    provider: osmStrategy,
    password: 'cookie_encryption_password_secure',
    isSecure: false,
    clientSecret,
    clientId
  });
}

export default setupOAuth;