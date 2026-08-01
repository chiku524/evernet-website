/** OpenAPI 3.0 description of the Evernet Storage API (v1). */
export const openApiSpec = {
  openapi: '3.0.3',
    info: {
    title: 'Evernet Storage API',
    version: '1.1.0',
    description:
      'Wallet-linked encrypted object storage for Stellar. Authenticate with a SEP-10 style challenge or API key, then upload/list/download ciphertext tied to a G-address. Includes an S3-shaped /s3/v1 surface (multipart, ranged GET, presigned downloads). Quota and content hashes register on Soroban; bytes live off-chain.',
    contact: { url: 'https://evernet.tech' },
  },
  servers: [
    { url: 'https://evernet-storage-api.vercel.app', description: 'Production' },
    { url: 'http://localhost:8787', description: 'Local development' },
  ],
  tags: [
    { name: 'Public' },
    { name: 'Auth' },
    { name: 'Profile' },
    { name: 'Keys' },
    { name: 'Objects' },
    { name: 'Folders' },
    { name: 'Purchases' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT or API key',
        description:
          'Wallet JWT from POST /auth/verify, or API key `evn_live_…` (also accepted via X-Evernet-Api-Key).',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: { error: { type: 'string' } },
        required: ['error'],
      },
      Profile: {
        type: 'object',
        properties: {
          address: { type: 'string' },
          quotaBytes: { type: 'integer' },
          usedBytes: { type: 'integer' },
          leaseExpires: { type: 'integer', description: 'Unix timestamp (seconds)' },
          objectCount: { type: 'integer' },
          source: { type: 'string' },
        },
      },
      ObjectMeta: {
        type: 'object',
        properties: {
          hash: { type: 'string', description: 'SHA-256 hex of stored bytes' },
          owner: { type: 'string' },
          name: { type: 'string' },
          folder: { type: 'string', description: 'Relative folder; empty = vault root' },
          mimeType: { type: 'string' },
          size: { type: 'integer' },
          encrypted: { type: 'boolean' },
          createdAt: { type: 'integer', description: 'Unix ms' },
          shards: { type: 'integer' },
          registrationTx: { type: 'string', description: 'Soroban register_object tx hash' },
        },
      },
    },
  },
  paths: {
    '/': {
      get: {
        tags: ['Public'],
        summary: 'API index',
        responses: {
          '200': {
            description: 'Links and version',
          },
        },
      },
    },
    '/health': {
      get: {
        tags: ['Public'],
        summary: 'Health check',
        responses: { '200': { description: 'Service status' } },
      },
    },
    '/openapi.json': {
      get: {
        tags: ['Public'],
        summary: 'OpenAPI 3 document',
        responses: { '200': { description: 'OpenAPI JSON' } },
      },
    },
    '/config/public': {
      get: {
        tags: ['Public'],
        summary: 'Network, treasury, contract, and plan catalog',
        responses: { '200': { description: 'Public config' } },
      },
    },
    '/auth/challenge': {
      post: {
        tags: ['Auth'],
        summary: 'Create SEP-10 style auth challenge',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['address'],
                properties: { address: { type: 'string', description: 'Stellar G-address' } },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Unsigned challenge XDR + network passphrase',
          },
          '400': { description: 'Invalid address', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/auth/verify': {
      post: {
        tags: ['Auth'],
        summary: 'Verify signed challenge and issue JWT',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['address', 'signedTransaction'],
                properties: {
                  address: { type: 'string' },
                  signedTransaction: { type: 'string', description: 'Signed challenge XDR' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: '{ token, address }' },
          '401': { description: 'Auth failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/profile': {
      get: {
        tags: ['Profile'],
        security: [{ bearerAuth: [] }],
        summary: 'Wallet storage profile (quota / used / lease)',
        responses: {
          '200': { description: 'Profile', content: { 'application/json': { schema: { $ref: '#/components/schemas/Profile' } } } },
          '401': { description: 'Missing or invalid token' },
        },
      },
    },
    '/usage': {
      get: {
        tags: ['Profile'],
        security: [{ bearerAuth: [] }],
        summary: 'Quota usage plus auth type and rate-limit metadata',
        responses: { '200': { description: '{ profile, auth, limits }' } },
      },
    },
    '/keys': {
      get: {
        tags: ['Keys'],
        security: [{ bearerAuth: [] }],
        summary: 'List API keys (wallet JWT only)',
        responses: { '200': { description: '{ keys }' } },
      },
      post: {
        tags: ['Keys'],
        security: [{ bearerAuth: [] }],
        summary: 'Create API key (wallet JWT only; secret returned once)',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { name: { type: 'string' } },
              },
            },
          },
        },
        responses: { '201': { description: '{ id, name, prefix, key, createdAt }' } },
      },
    },
    '/keys/{id}': {
      delete: {
        tags: ['Keys'],
        security: [{ bearerAuth: [] }],
        summary: 'Revoke API key (wallet JWT only)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: '{ ok }' } },
      },
    },
    '/projects': {
      get: {
        tags: ['Keys'],
        security: [{ bearerAuth: [] }],
        summary: 'List project billing pools (wallet JWT)',
        responses: { '200': { description: '{ projects }' } },
      },
      post: {
        tags: ['Keys'],
        security: [{ bearerAuth: [] }],
        summary: 'Create project pool with optional maxBytes soft cap',
        responses: { '201': { description: 'Project' } },
      },
    },
    '/projects/{id}': {
      patch: {
        tags: ['Keys'],
        security: [{ bearerAuth: [] }],
        summary: 'Update project name or soft cap',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Project' } },
      },
      delete: {
        tags: ['Keys'],
        security: [{ bearerAuth: [] }],
        summary: 'Archive project',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: '{ ok }' } },
      },
    },
    '/objects': {
      get: {
        tags: ['Objects'],
        security: [{ bearerAuth: [] }],
        summary: 'List objects and folders',
        responses: {
          '200': {
            description: '{ objects, folders }',
          },
        },
      },
      post: {
        tags: ['Objects'],
        security: [{ bearerAuth: [] }],
        summary: 'Upload an object (multipart)',
        description:
          'Send multipart form-data with field `file` (required). Optional fields: `name`, `folder`, `mimeType`, `encrypted` (default true). Max 80 MB. Prefer client-side encryption before upload.',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: {
                  file: { type: 'string', format: 'binary' },
                  name: { type: 'string' },
                  folder: { type: 'string' },
                  mimeType: { type: 'string' },
                  encrypted: { type: 'string', enum: ['true', 'false'] },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: '{ object, profile, folders }' },
          '402': { description: 'Insufficient quota' },
          '409': { description: 'Duplicate content hash' },
        },
      },
    },
    '/objects/{hash}': {
      get: {
        tags: ['Objects'],
        security: [{ bearerAuth: [] }],
        summary: 'Download object bytes',
        parameters: [{ name: 'hash', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'Raw octets; headers X-Object-Name, X-Object-Mime',
            content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } },
          },
          '404': { description: 'Not found' },
        },
      },
      patch: {
        tags: ['Objects'],
        security: [{ bearerAuth: [] }],
        summary: 'Rename or move object',
        parameters: [{ name: 'hash', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  folder: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: '{ object, folders }' },
          '404': { description: 'Not found' },
        },
      },
      delete: {
        tags: ['Objects'],
        security: [{ bearerAuth: [] }],
        summary: 'Delete object',
        parameters: [{ name: 'hash', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: '{ ok, profile, folders }' } },
      },
    },
    '/folders': {
      get: {
        tags: ['Folders'],
        security: [{ bearerAuth: [] }],
        summary: 'List folders',
        responses: { '200': { description: '{ folders }' } },
      },
      post: {
        tags: ['Folders'],
        security: [{ bearerAuth: [] }],
        summary: 'Create folder',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['path'],
                properties: { path: { type: 'string' } },
              },
            },
          },
        },
        responses: { '201': { description: '{ path, folders }' } },
      },
      patch: {
        tags: ['Folders'],
        security: [{ bearerAuth: [] }],
        summary: 'Rename / move folder',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['from', 'to'],
                properties: { from: { type: 'string' }, to: { type: 'string' } },
              },
            },
          },
        },
        responses: { '200': { description: '{ folders, moved }' } },
      },
      delete: {
        tags: ['Folders'],
        security: [{ bearerAuth: [] }],
        summary: 'Delete folder',
        parameters: [
          { name: 'path', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'recursive', in: 'query', schema: { type: 'boolean' } },
        ],
        responses: { '200': { description: '{ ok, folders, deletedHashes }' } },
      },
    },
    '/s3/v1': {
      get: {
        tags: ['Public'],
        summary: 'S3-shaped cloud API capability probe',
        responses: { '200': { description: 'Endpoint map + limits' } },
      },
    },
    '/s3/v1/objects': {
      get: {
        tags: ['Objects'],
        security: [{ bearerAuth: [] }],
        summary: 'List objects by prefix (S3-shaped)',
        parameters: [
          { name: 'prefix', in: 'query', schema: { type: 'string' } },
          { name: 'delimiter', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: '{ contents, commonPrefixes }' } },
      },
    },
    '/s3/v1/object': {
      put: {
        tags: ['Objects'],
        security: [{ bearerAuth: [] }],
        summary: 'Put object by key (raw body, max 80MB)',
        parameters: [{ name: 'key', in: 'query', required: true, schema: { type: 'string' } }],
        responses: { '201': { description: '{ key, object, profile }' } },
      },
      get: {
        tags: ['Objects'],
        security: [{ bearerAuth: [] }],
        summary: 'Get object by key (supports Range)',
        parameters: [{ name: 'key', in: 'query', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Bytes' }, '206': { description: 'Partial content' } },
      },
      delete: {
        tags: ['Objects'],
        security: [{ bearerAuth: [] }],
        summary: 'Delete object by key',
        parameters: [{ name: 'key', in: 'query', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: '{ ok, profile }' } },
      },
    },
    '/s3/v1/presign': {
      post: {
        tags: ['Objects'],
        security: [{ bearerAuth: [] }],
        summary: 'Create time-limited download URL',
        responses: { '200': { description: '{ url, token, expiresAt }' } },
      },
    },
    '/s3/v1/multipart': {
      post: {
        tags: ['Objects'],
        security: [{ bearerAuth: [] }],
        summary: 'Start multipart upload (up to 64×16MB)',
        responses: { '201': { description: '{ uploadId, key, … }' } },
      },
    },
    '/purchases/confirm': {
      post: {
        tags: ['Purchases'],
        security: [{ bearerAuth: [] }],
        summary: 'Confirm XLM plan payment and credit Soroban quota',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['planId', 'txHash'],
                properties: {
                  planId: { type: 'string', enum: ['starter', 'growth', 'pro'] },
                  txHash: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { '200': { description: '{ ok, profile, amount, txHash, explorerUrl }' } },
      },
    },
  },
} as const
