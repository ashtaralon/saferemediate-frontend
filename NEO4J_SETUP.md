# Neo4j Configuration

The Neo4j AWS Map component now uses a secure API proxy route instead of direct browser connections.

## Environment Variables

Add these to your `.env.local` and Vercel environment variables:

```bash
NEO4J_URI=https://4e9962b7.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=zxr4y5USTynIAh9VD7wej1Zq6UkQenJSOKunANe3aew
```

## Security Notes

1. **Never commit credentials to git** - They are currently hardcoded as fallbacks but should be moved to environment variables
2. **Rotate the password** - The current password is exposed in the codebase
3. **Use Vercel Environment Variables** - Add these in your Vercel project settings

## How It Works

1. Frontend component calls `/api/proxy/neo4j/query`
2. Next.js API route (server-side) connects to Neo4j
3. Results are returned to the frontend
4. This avoids CORS issues and keeps credentials secure

## Adding to Vercel

1. Go to your Vercel project settings
2. Navigate to "Environment Variables"
3. Add the three variables above
4. Redeploy the application
