# Swagger UI Examples and Screenshots

## Using Swagger UI to Test the API

### Step-by-Step Guide

#### 1. Access Swagger UI

Start the server:

```bash
npm run dev
```

Open your browser:

```
http://localhost:8080/swagger
```

#### 2. Authenticate

Before you can test protected endpoints, you need to authenticate:

1. Look for the **"Authorize"** button at the top right of the Swagger UI (🔒 icon)
2. Click it to open the authorization dialog
3. You'll see two options:

**Option A: BearerAuth (http, Bearer)**

- Enter: `user123:johndoe`
- Click **Authorize**

**Option B: BasicAuth (http, Basic)**

- Username: `johndoe`
- Password: `user123`
- Click **Authorize**

4. Click **Close** to return to the main page

Now all requests will include your authentication credentials!

#### 3. Test Health Check (No Auth Required)

1. Find **GET /health** endpoint
2. Click to expand it
3. Click **"Try it out"** button
4. Click **"Execute"** button
5. Scroll down to see the response

**Expected Response**:

```json
{
  "status": "ok",
  "timestamp": "2025-11-13T10:30:00.000Z"
}
```

#### 4. List Namespaces

1. Find **GET /kubernetes/namespace** endpoint
2. Click to expand it
3. Make sure you're authenticated (see step 2)
4. Click **"Try it out"** button
5. Click **"Execute"** button

**Expected Response**:

```json
[
  {
    "name": "che-johndoe",
    "attributes": {
      "phase": "Active",
      "default": "true"
    }
  }
]
```

#### 5. Provision a Namespace

1. Find **POST /kubernetes/namespace/provision** endpoint
2. Click to expand it
3. Make sure you're authenticated (see step 2)
4. Click **"Try it out"** button
5. Click **"Execute"** button
6. View the response

**Expected Response**:

```json
{
  "name": "che-johndoe",
  "attributes": {
    "phase": "Active",
    "default": "true"
  }
}
```

## Understanding the Swagger UI Interface

### Endpoint Section

Each endpoint shows:

- **HTTP Method** (GET, POST, etc.) with color coding
- **Path** (e.g., `/kubernetes/namespace/provision`)
- **Summary** - Brief description
- **Security** - 🔒 icon if authentication is required

### Expanded Endpoint

When you click an endpoint, you see:

- **Description** - Detailed explanation
- **Parameters** - Query params, headers, body (if any)
- **Responses** - All possible response codes
- **Schema** - Data structure definitions
- **Examples** - Sample requests and responses

### Response Section

After executing a request:

- **Code** - HTTP status code (200, 401, 500, etc.)
- **Details** - Response headers and body
- **Response body** - Formatted JSON
- **Response headers** - Content-Type, etc.
- **Curl** - Equivalent curl command
- **Request duration** - How long it took

## Common Use Cases

### Use Case 1: First Time User Setup

```
1. Start server → npm run dev
2. Open Swagger UI → http://localhost:8080/swagger
3. Click Authorize → Enter "user123:johndoe"
4. Test health → GET /health → Execute
5. Provision namespace → POST /kubernetes/namespace/provision → Execute
6. List namespaces → GET /kubernetes/namespace → Execute
```

### Use Case 2: Testing Different Users

```
1. Authorize with first user: "user123:johndoe"
2. Provision namespace → POST /kubernetes/namespace/provision
   Result: che-johndoe

3. Click Authorize again
4. Enter different user: "user456:janedoe"
5. Click Authorize
6. Provision namespace again → POST /kubernetes/namespace/provision
   Result: che-janedoe

7. List all namespaces → GET /kubernetes/namespace
   See both namespaces listed
```

### Use Case 3: Testing Error Scenarios

**Test Unauthorized Request**:

```
1. If you're authorized, click Authorize → Logout
2. Try POST /kubernetes/namespace/provision
3. See 401 Unauthorized response
```

**Test Invalid Auth**:

```
1. Click Authorize
2. Enter invalid token: "invalid"
3. Try POST /kubernetes/namespace/provision
4. See 401 Unauthorized response
```

## Exploring Schemas

### View KubernetesNamespaceMeta Schema

1. Scroll down to **Schemas** section at the bottom
2. Click **KubernetesNamespaceMeta**
3. See the structure:

```yaml
KubernetesNamespaceMeta:
  type: object
  required:
    - name
    - attributes
  properties:
    name:
      type: string
      description: The name of the namespace
      example: che-johndoe
    attributes:
      type: object
      additionalProperties:
        type: string
```

This tells you:

- What fields are required (`name`, `attributes`)
- What types they are (string, object)
- Examples of valid values

## Download OpenAPI Specification

### For Import into Other Tools

**JSON Format** (for Postman, Insomnia):

```bash
curl http://localhost:8080/swagger/json > openapi.json
```

**YAML Format** (for editing, version control):

```bash
curl http://localhost:8080/swagger/yaml > openapi.yaml
```

### Import into Postman

1. Open Postman
2. Click **Import** button
3. Select **Link** tab
4. Enter: `http://localhost:8080/swagger/json`
5. Click **Continue** → **Import**
6. All endpoints will be imported as a collection

### Import into Insomnia

1. Open Insomnia
2. Click **Create** dropdown → **Import From URL**
3. Enter: `http://localhost:8080/swagger/yaml`
4. Click **Fetch and Import**

## Generate Client Code

### TypeScript/JavaScript Client

```bash
# Install generator
npm install -g @openapitools/openapi-generator-cli

# Generate TypeScript Axios client
openapi-generator-cli generate \
  -i http://localhost:8080/swagger/json \
  -g typescript-axios \
  -o ./generated-client

# Use in your code
import { DefaultApi } from './generated-client';

const api = new DefaultApi();
const result = await api.provisionNamespace();
```

### Python Client

```bash
openapi-generator-cli generate \
  -i http://localhost:8080/swagger/json \
  -g python \
  -o ./python-client

# Use in Python
from python_client import DefaultApi

api = DefaultApi()
result = api.provision_namespace()
```

## Tips and Tricks

### 1. Persistent Authorization

Swagger UI remembers your authentication between page refreshes. Just authorize once!

### 2. Copy as cURL

After executing any request:

1. Look for the **Curl** section in the response
2. Copy the command
3. Paste into terminal
4. Modify as needed

### 3. Filter Endpoints

Use the filter box at the top to search:

- Type "provision" → Shows only provision endpoint
- Type "namespace" → Shows all namespace-related endpoints
- Type "health" → Shows health check

### 4. Expand/Collapse All

- Click **"Expand Operations"** to see all endpoints at once
- Click **"Collapse Operations"** to hide details

### 5. View Raw Response

Click the **"Download"** button in the response section to save the raw response body.

### 6. Dark Mode

Some browsers support dark mode automatically. Otherwise, you can customize the CSS in `src/config/swagger.ts`.

## Advanced Features

### Model Schemas

Click on any schema in a request/response to jump to the full definition:

```
Response: KubernetesNamespaceMeta
          ↓ (click)
Jumps to Schemas → KubernetesNamespaceMeta
```

### Try Different Response Codes

The API may return different response codes:

- **200** - Success
- **401** - Unauthorized
- **500** - Server Error

Each is documented with example responses!

### Request Duration

See how long each request takes:

- Displayed below the response
- Useful for performance testing
- Shows network + server time

## Troubleshooting

### "Failed to fetch"

**Problem**: Swagger UI shows "Failed to fetch" error

**Solutions**:

1. Check server is running: `curl http://localhost:8080/health`
2. Check port number in browser URL matches server
3. Check browser console for CORS errors
4. Try refreshing the page

### "Unauthorized" Even After Authenticating

**Problem**: Still getting 401 after clicking Authorize

**Solutions**:

1. Make sure you clicked **"Authorize"** button, not just entering the value
2. Use correct format:
   - Bearer: `userid:username` (no "Bearer" prefix)
   - Basic: username and userid in separate fields
3. Click **"Authorize"** then **"Close"**
4. Try the request again

### OpenAPI Spec Not Loading

**Problem**: `/swagger` shows blank page

**Solutions**:

1. Check server logs for YAML parsing errors
2. Validate spec: `swagger-cli validate src/swagger/openapi.yaml`
3. Check file exists: `ls src/swagger/openapi.yaml`
4. Restart server: `npm run dev`

## Best Practices

### When Testing

1. ✅ **Always authenticate first** before testing protected endpoints
2. ✅ **Start with health check** to verify server is running
3. ✅ **Check response codes** - 200 is success, anything else is an error
4. ✅ **Read descriptions** - They explain what each endpoint does
5. ✅ **Try examples** - They show you the expected format

### For Development

1. ✅ **Keep Swagger tab open** while developing
2. ✅ **Refresh after code changes** to see updates
3. ✅ **Use as API reference** instead of writing docs separately
4. ✅ **Share URL with team** - Everyone can see the same docs
5. ✅ **Export spec for version control** - Track API changes

## Screenshot Guide

### What You'll See

**Main Page**:

- Title: "Eclipse Che Next API Server"
- Description with feature list
- Three sections: health, kubernetes-namespace
- Authorize button (top right)
- Schemas section (bottom)

**Endpoint Expanded**:

- HTTP method badge (colored: green=GET, blue=POST)
- Endpoint path
- Lock icon if auth required
- Description and details
- Try it out button
- Parameters section (if any)
- Responses section with examples
- Execute button

**Response Display**:

- Response code with color (green=2xx, red=4xx/5xx)
- Response body (formatted JSON)
- Response headers
- Curl command equivalent
- Request duration in milliseconds

**Authorization Dialog**:

- Two tabs: BearerAuth and BasicAuth
- Input fields for credentials
- Authorize button
- Close button
- Logout option (if already authorized)

---

**Happy testing with Swagger UI! 🎉**

For more details, see:

- [SWAGGER_GUIDE.md](../SWAGGER_GUIDE.md) - Complete Swagger documentation
- [README.md](../README.md) - Full API reference
- [QUICKSTART.md](../QUICKSTART.md) - Getting started guide
