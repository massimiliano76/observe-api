import config from 'config';
import db from '../app/services/db';
import { expect } from 'chai';
import { createMockUser } from './utils/mock-factory';
import Client from './utils/http-client';
import { readFile } from 'fs-extra';
import path from 'path';
import { getAllMediaUrls } from '../app/services/media-store';
import axios from 'axios';

/* global apiUrl */

const mediaSizes = config.get('media.sizes');

describe('Photos endpoints', async function () {
  before(async function () {
    await db('users').delete();
    await db('photos').delete();
  });

  describe('POST /photos', function () {
    it('return 401 for non-authenticated user', async function () {
      try {
        const client = new Client(apiUrl);
        await client.post('/photos', {});

        // This line should be reached, force executing the catch block with
        // generic error.
        throw Error('An error was expected.');
      } catch (error) {
        // Check for the appropriate status response
        expect(error.response.status).to.equal(401);
      }
    });

    it('return 200 for authenticated user and store photo', async function () {
      // Create authenticated client
      const regularUser = await createMockUser();
      const client = new Client(apiUrl);
      await client.login(regularUser.osmId);

      // Get .jpg file as base64
      const file = (await readFile(
        path.join(__dirname, './fixtures/photo.jpg')
      )).toString('base64');

      // Set metadata data
      const metadata = {
        lon: 30,
        lat: -30,
        bearing: 8,
        createdAt: new Date().toISOString(),
        osmObjects: ['way/677949489', 'node/677949489', 'relation/10203930293']
      };

      // Post request
      const { status, data } = await client.post('/photos', {
        file,
        ...metadata
      });

      expect(status).to.equal(200);

      expect(data).to.have.property('id');
      expect(data).to.have.property('uploadedAt');
      expect(data).to.have.property('ownerId', regularUser.osmId);
      expect(data).to.have.property('createdAt', metadata.createdAt);
      expect(data).to.have.property('bearing', metadata.bearing);
      expect(data.urls).to.deep.equal(getAllMediaUrls(data.id));
      expect(data.osmObjects).to.deep.equal(metadata.osmObjects);
      expect(data.location).to.deep.equal({
        type: 'Point',
        coordinates: [metadata.lon, metadata.lat]
      });

      // Check if media file is available at URLs provided
      for (let i = 0; i < mediaSizes.length; i++) {
        const size = mediaSizes[i].id;
        const url = data.urls[size];
        const { status } = await axios.get(url);
        expect(status).to.equal(200);
      }
    });
  });

  describe('GET /photos/{id}', function () {
    it('return 401 for non-authenticated user', async function () {
      try {
        const client = new Client(apiUrl);
        await client.get('/photos/abcdefghij');

        // The test should never reach here, force execute catch block.
        throw Error('An error was expected.');
      } catch (error) {
        // Check for the appropriate status response
        expect(error.response.status).to.equal(401);
      }
    });

    it('return 404 for non-existing photo', async function () {
      try {
        // Create client
        const regularUser = await createMockUser();
        const client = new Client(apiUrl);
        await client.login(regularUser.osmId);

        // Fetch resource
        await client.get('/photos/abcdefghij');

        // The test should never reach here, force execute catch block.
        throw Error('An error was expected.');
      } catch (error) {
        // Check for the appropriate status response
        expect(error.response.status).to.equal(404);
      }
    });

    it('return 200 for existing photo', async function () {
      // Create authenticated client
      const regularUser = await createMockUser();
      const client = new Client(apiUrl);
      await client.login(regularUser.osmId);

      // Get .jpg file as base64
      const file = (await readFile(
        path.join(__dirname, './fixtures/photo.jpg')
      )).toString('base64');

      // Set metadata data
      const metadata = {
        lon: 40,
        lat: -13,
        bearing: 272,
        createdAt: new Date().toISOString(),
        osmObjects: ['way/62239489', 'node/55555', 'relation/9999999']
      };

      // Post request
      const {
        data: { id }
      } = await client.post('/photos', { file, ...metadata });

      // Fetch resource
      const { status, data } = await client.get(`/photos/${id}`);

      expect(status).to.equal(200);

      expect(data).to.have.property('id');
      expect(data).to.have.property('uploadedAt');
      expect(data).to.have.property('ownerId', regularUser.osmId);
      expect(data).to.have.property('createdAt', metadata.createdAt);
      expect(data).to.have.property('bearing', metadata.bearing);
      expect(data.urls).to.deep.equal(getAllMediaUrls(id));
      expect(data.osmObjects).to.deep.equal(metadata.osmObjects);
      expect(data.location).to.deep.equal({
        type: 'Point',
        coordinates: [metadata.lon, metadata.lat]
      });
    });
  });

});
