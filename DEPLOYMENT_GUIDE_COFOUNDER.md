# Deployment Guide: AI Co-founder Message Persistence

## Overview
This guide walks you through deploying the AI co-founder message persistence feature to your production environment.

## Pre-Deployment Checklist

### 1. Review Changes
- [ ] Review the PR changes on GitHub
- [ ] Read `IMPLEMENTATION_SUMMARY.md` to understand the implementation
- [ ] Read `COFOUNDER_PERSISTENCE.md` for technical details
- [ ] Ensure all CI/CD checks pass

### 2. Backup Database
**IMPORTANT**: Before applying schema changes, backup your production database:

```bash
# For PostgreSQL
pg_dump -h your-host -U your-user -d your-database > backup_$(date +%Y%m%d_%H%M%S).sql
```

### 3. Environment Check
Verify your production environment has:
- [ ] PostgreSQL 14+ with pgvector extension
- [ ] Node.js 18+ or 20+
- [ ] All required environment variables set
- [ ] Sufficient database storage

## Deployment Steps

### Step 1: Pull Latest Code
```bash
# Pull the PR branch or merge to main first
git pull origin main  # or your production branch

# Navigate to client directory
cd client
```

### Step 2: Install Dependencies
```bash
# Install any new dependencies (none in this case, but good practice)
npm install
```

### Step 3: Generate Prisma Client
```bash
# Generate the updated Prisma client with new CofounderMessage model
npx prisma generate
```

Expected output:
```
✔ Generated Prisma Client to ./node_modules/@prisma/client
```

### Step 4: Apply Database Schema Changes
```bash
# Push schema changes to database
npx prisma db push
```

This will:
- Create the new `CofounderMessage` table
- Add the relation to the `Conversation` table
- Create indexes on `conversationId` and `createdAt`

Expected output:
```
The database is now in sync with the Prisma schema.
```

### Step 5: Verify Schema Changes
```bash
# Optional: Open Prisma Studio to verify the new table
npx prisma studio
```

Navigate to the `CofounderMessage` model and verify:
- Table exists
- Columns are correct: id, content, role, createdAt, conversationId
- Indexes are created

### Step 6: Build Application
```bash
# Build the Next.js application
npm run build
```

Verify build completes successfully without errors.

### Step 7: Deploy
Deploy using your deployment method:

#### For Vercel:
```bash
vercel --prod
```

#### For Manual Deployment:
```bash
# Start the production server
npm start
```

## Post-Deployment Verification

### 1. Smoke Test - Create New Conversation
1. Log into the application
2. Navigate to a conversation with AI co-founder
3. Send a message to the AI co-founder
4. Verify you receive a response
5. **Refresh the page**
6. ✅ Verify the message and response are still visible

### 2. Check Existing Conversations
1. Navigate to an existing conversation (from before the deployment)
2. AI co-founder tab should work normally
3. Any new messages should persist after refresh

### 3. Database Verification
```bash
# Connect to your database
psql -h your-host -U your-user -d your-database

# Check the table exists
\dt CofounderMessage

# Check if messages are being saved
SELECT COUNT(*) FROM "CofounderMessage";

# View recent messages
SELECT id, role, LEFT(content, 50) as content_preview, "createdAt"
FROM "CofounderMessage"
ORDER BY "createdAt" DESC
LIMIT 5;
```

### 4. Monitor Logs
Watch application logs for any errors:
```bash
# Check for any errors related to cofounder messages
grep -i "cofounder" /path/to/your/logs

# Or in Vercel dashboard, check Function Logs
```

### 5. Performance Check
- [ ] Verify page load times are similar to before deployment
- [ ] Check database query performance
- [ ] Monitor memory usage

## Rollback Plan

If issues occur, you can rollback:

### Option 1: Rollback Application Only
```bash
# Revert to previous deployment
git revert <commit-hash>
npm run build
# Deploy reverted version
```

The `CofounderMessage` table will remain but won't be used.

### Option 2: Full Rollback (Including Database)
⚠️ **WARNING**: Only do this if absolutely necessary

```bash
# Restore from backup
psql -h your-host -U your-user -d your-database < backup_file.sql

# Or drop just the new table
psql -h your-host -U your-user -d your-database -c "DROP TABLE IF EXISTS \"CofounderMessage\" CASCADE;"
```

## Monitoring

### Key Metrics to Watch
1. **Database Size**: Monitor growth of `CofounderMessage` table
2. **Query Performance**: Check query times for message loading
3. **Error Rates**: Watch for any new errors in logs
4. **User Engagement**: Track co-founder usage before/after

### Database Queries for Monitoring
```sql
-- Check table size
SELECT 
    pg_size_pretty(pg_total_relation_size('"CofounderMessage"')) as total_size;

-- Messages per day
SELECT 
    DATE("createdAt") as date,
    COUNT(*) as message_count
FROM "CofounderMessage"
GROUP BY DATE("createdAt")
ORDER BY date DESC
LIMIT 7;

-- Average messages per conversation
SELECT 
    AVG(message_count) as avg_messages
FROM (
    SELECT "conversationId", COUNT(*) as message_count
    FROM "CofounderMessage"
    GROUP BY "conversationId"
) subquery;
```

## Troubleshooting

### Issue: "Table CofounderMessage does not exist"
**Solution**: Run `npx prisma db push` again

### Issue: "Prisma Client did not initialize yet"
**Solution**: Run `npx prisma generate` and restart the application

### Issue: Messages not loading
**Check**:
1. Browser console for errors
2. Network tab for failed API calls
3. Server logs for database errors
4. Database connectivity

### Issue: Slow message loading
**Check**:
1. Database indexes are created: `\d "CofounderMessage"` in psql
2. Number of messages in table
3. Database connection pool settings

## Success Criteria

Deployment is successful when:
- ✅ No errors in application logs
- ✅ Messages persist after page refresh
- ✅ Existing conversations still work
- ✅ New messages are saved to database
- ✅ No performance degradation
- ✅ Users report improved experience

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review the implementation docs:
   - `IMPLEMENTATION_SUMMARY.md`
   - `COFOUNDER_PERSISTENCE.md`
3. Check GitHub issues for similar problems
4. Review application logs for specific error messages

## Timeline

Recommended deployment schedule:
- **Week 1**: Deploy to staging/development environment
- **Week 1**: Internal testing
- **Week 2**: Deploy to production during low-traffic period
- **Week 2**: Monitor closely for 48 hours
- **Week 3**: Collect user feedback

## Notes

- This is a **non-breaking change** - existing functionality continues to work
- Old conversations won't have message history (only new messages from this point forward)
- The feature is backward compatible
- No data loss risk - new table is independent

## Conclusion

This deployment adds significant value to users by making AI co-founder conversations persistent. The implementation follows best practices and integrates seamlessly with the existing codebase.

Good luck with your deployment! 🚀
