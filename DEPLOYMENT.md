# PPFL Surveillance System - Deployment Guide

## Overview
This Privacy-Preserving Federated Learning (PPFL) surveillance system is designed for production deployment with separate frontend and backend hosting.

## Architecture
- **Frontend**: React SPA deployed on Netlify
- **Backend**: Node.js API server deployed on Render/Heroku/Railway
- **AI Service**: Python FastAPI service deployed separately
- **Database**: Neon PostgreSQL (serverless)

## Frontend Deployment (Netlify)

### Prerequisites
- Netlify account
- GitHub repository connected to Netlify

### Setup Steps
1. **Connect Repository**: Link your GitHub repo to Netlify
2. **Build Settings**:
   - Build command: `vite build`
   - Publish directory: `dist/public`
   - Node version: 20

3. **Environment Variables** (Required):
   ```
   VITE_API_BASE_URL=https://your-backend.herokuapp.com
   VITE_WS_URL=wss://your-backend.herokuapp.com
   ```

4. **Deploy**: Netlify will automatically build and deploy

### Custom Domain (Optional)
- Add custom domain in Netlify dashboard
- SSL is automatically provided

## Backend Deployment

### Option 1: Heroku
```bash
# Install Heroku CLI
npm install -g heroku

# Login and create app
heroku login
heroku create your-ppfl-backend

# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set DATABASE_URL=your_neon_connection_string
heroku config:set AI_SERVICE_URL=https://your-ai-service.com
heroku config:set AI_SERVICE_API_KEY=your_api_key

# Deploy
git push heroku main
```

### Option 2: Render
1. Connect GitHub repository
2. Set build command: `npm run build`
3. Set start command: `npm start`
4. Add environment variables in dashboard

### Option 3: Railway
1. Connect GitHub repository
2. Railway auto-detects Node.js
3. Add environment variables
4. Deploy automatically

## Database Setup (Neon)

1. **Create Neon Project**:
   - Go to [neon.tech](https://neon.tech)
   - Create new project
   - Note the connection string

2. **Database Migration**:
   ```bash
   npm run db:push
   ```

3. **Environment Variable**:
   - Add `DATABASE_URL` to your backend deployment

## AI Service Deployment (Python)

### FastAPI Service
```python
# requirements.txt
fastapi
uvicorn
torch
transformers
opencv-python
pillow
```

### Deploy Options
- **Render**: Best for Python services
- **Railway**: Good auto-deployment
- **Google Cloud Run**: Serverless option

## Environment Variables Reference

### Frontend (.env.production)
```
VITE_API_BASE_URL=https://your-backend.herokuapp.com
VITE_WS_URL=wss://your-backend.herokuapp.com
```

### Backend
```
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@host:5432/db
AI_SERVICE_URL=https://your-ai-service.com
AI_SERVICE_API_KEY=your_secure_api_key
PORT=5000
```

## Security Configuration

### CORS Setup
The backend automatically configures CORS for production domains. Update `server/index.ts` if needed:

```javascript
app.use(cors({
  origin: [
    'https://your-app.netlify.app',
    'https://your-custom-domain.com'
  ],
  credentials: true
}));
```

### SSL/HTTPS
- Netlify provides automatic SSL
- Backend platforms (Heroku/Render) provide SSL
- Ensure all API calls use HTTPS

## Monitoring & Maintenance

### Health Checks
- Frontend: Check `/` endpoint
- Backend: Check `/api/status` endpoint
- AI Service: Check `/health` endpoint

### Logs
- Netlify: Function logs in dashboard
- Backend: Platform-specific logging
- AI Service: Python logging to stdout

### Performance
- Enable gzip compression
- Use CDN for static assets
- Monitor API response times
- Set up alerts for downtime

## Troubleshooting

### Common Issues
1. **CORS Errors**: Check origin configuration
2. **WebSocket Failures**: Verify WSS URL and protocol
3. **AI Service Timeout**: Increase timeout values
4. **Database Connection**: Check connection string and SSL settings

### Debug Steps
1. Check environment variables
2. Verify API endpoints are accessible
3. Test WebSocket connections
4. Monitor server logs
5. Check network connectivity

## Production Checklist

- [ ] Frontend deployed to Netlify
- [ ] Backend deployed to cloud platform
- [ ] Database connected and migrated
- [ ] Environment variables configured
- [ ] CORS properly set up
- [ ] SSL certificates active
- [ ] Health checks passing
- [ ] Error monitoring enabled
- [ ] Backup strategy implemented
- [ ] Performance monitoring active

## Scaling Considerations

### Frontend
- Netlify handles scaling automatically
- Use CDN for global distribution
- Optimize bundle size

### Backend
- Enable auto-scaling on platform
- Use connection pooling for database
- Implement rate limiting
- Consider load balancing for high traffic

### Database
- Neon scales automatically
- Monitor connection limits
- Set up read replicas if needed

## Support

For deployment issues:
1. Check platform-specific documentation
2. Verify environment variables
3. Review application logs
4. Test API endpoints manually
5. Contact platform support if needed
