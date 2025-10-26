# 🚀 NeuraLaunch

[![Production Ready](https://img.shields.io/badge/production-ready-brightgreen.svg)](https://github.com/mansaraysaheedalpha/neuralaunch)
[![Security: A+](https://img.shields.io/badge/security-A+-success.svg)](#security-features)
[![Performance: A+](https://img.shields.io/badge/performance-A+-success.svg)](#performance-optimization)

> **Transform Ideas into Validated Startups with AI-Powered Precision**

NeuraLaunch is an AI-powered startup validation platform that combines intelligent blueprints with structured validation sprints, empowering founders to turn visionary ideas into market-ready startups.

## ✨ Key Features

### 🎯 AI-Powered Startup Generation
- **Intelligent Blueprints**: Generate comprehensive startup plans using Google Gemini AI
- **Strategic Validation Framework**: 72-hour validation sprints with AI assistance
- **Market Analysis**: Automated niche selection and competitive analysis
- **Business Model Design**: Revenue architecture and unit economics projections

### 🤖 AI Co-Founder with Memory (RAG)
- **Persistent Conversations**: All co-founder chats are saved to database and persist across sessions
- **Persistent Context**: AI remembers your entire project history
- **Vector Search**: Retrieves relevant past conversations and insights
- **Strategic Guidance**: Acts as Y Combinator partner + lean startup expert
- **Devil's Advocate**: Challenges assumptions with data and logic

### 📊 Landing Page Builder & Analytics
- **No-Code Builder**: Generate landing pages from your blueprint
- **A/B Testing**: Test multiple design variants
- **Analytics Dashboard**: Track views, signups, and conversions
- **Smoke Testing**: Validate feature interest before building

### ⚡ Validation Sprint System
- **Task Management**: Structured 72-hour validation tasks
- **AI Assistants**: Specialized helpers for customer profiles, outreach, and analysis
- **Progress Tracking**: Real-time sprint analytics and achievements
- **Email Reminders**: Stay on track with automated notifications

### 🏆 Gamification & Achievements
- **Milestone Tracking**: Unlock achievements as you progress
- **Leaderboards**: Global trends and top performing ideas
- **Tag System**: Discover patterns in successful startups

## 🛠️ Technology Stack

### Frontend
- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS
- **UI Components**: Radix UI + shadcn/ui
- **Animations**: Framer Motion
- **State**: Zustand
- **Data Fetching**: SWR

### Backend
- **Runtime**: Node.js 20+
- **API**: Next.js API Routes
- **Database**: PostgreSQL 14+ with pgvector
- **ORM**: Prisma
- **Authentication**: NextAuth (v5) with Google OAuth

### AI & ML
- **Primary AI**: Google Gemini (gemini-1.5-flash, gemini-1.5-pro)
- **Secondary**: OpenAI GPT-4 (MVP generation)
- **Vector DB**: pgvector for RAG (Retrieval-Augmented Generation)
- **Embeddings**: OpenAI text-embedding-3-small

### Infrastructure
- **Deployment**: Vercel (recommended)
- **Email**: Resend
- **Analytics**: Vercel Analytics
- **Monitoring**: Built-in health checks

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ or 20+
- PostgreSQL 14+ with pgvector extension
- Google OAuth credentials
- Google Gemini API key
- OpenAI API key
- Resend API key

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/mansaraysaheedalpha/neuralaunch.git
cd neuralaunch/client
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
```bash
cp .env.example .env
# Edit .env with your credentials
```

4. **Set up the database**
```bash
npx prisma generate
npx prisma db push
```

5. **Run development server**
```bash
npm run dev
```

6. **Open your browser**
```
http://localhost:3000
```

## 📖 Documentation

- **[Deployment Guide](./DEPLOYMENT.md)** - Complete production deployment instructions
- **[API Documentation](#api-documentation)** - API endpoints and usage
- **[Architecture](#architecture)** - System design and data flow

## 🔒 Security Features

### A+ Security Rating
- ✅ **Input Validation**: Zod schemas on all API endpoints
- ✅ **Rate Limiting**: Configurable limits per endpoint
- ✅ **XSS Prevention**: Input sanitization utilities
- ✅ **CSRF Protection**: Secure session management
- ✅ **SQL Injection**: Prisma ORM with parameterized queries
- ✅ **Security Headers**: CSP, X-Frame-Options, HSTS, etc.
- ✅ **Environment Validation**: Type-safe configuration
- ✅ **Error Handling**: No sensitive data in error messages

## ⚡ Performance Optimization

### A+ Performance Rating
- ✅ **Database Indexes**: Optimized queries on all tables
- ✅ **Response Caching**: Smart caching for public data
- ✅ **Code Splitting**: Dynamic imports for reduced bundle size
- ✅ **Image Optimization**: Next.js Image component
- ✅ **Connection Pooling**: Efficient database connections
- ✅ **API Response Compression**: Reduced payload sizes
- ✅ **Lazy Loading**: Components and data loaded on demand

## 🧪 Testing & Quality

### Code Quality
- **Linting**: ESLint with TypeScript strict rules
- **Type Safety**: Full TypeScript coverage
- **Error Boundaries**: Graceful error handling
- **Logging**: Structured logging with context
- **Health Checks**: `/api/health` endpoint

## 📊 API Documentation

### Public Endpoints
- `GET /api/health` - System health check
- `GET /api/trends` - Global startup trends (cached for public)
- `GET /lp/[slug]` - Public landing pages

### Authenticated Endpoints
- `POST /api/chat` - Generate startup blueprints
- `POST /api/cofounder` - Chat with AI co-founder (RAG)
- `POST /api/landing-page/generate` - Create landing page
- `GET /api/landing-page/analytics` - View analytics
- `POST /api/sprint/start` - Begin validation sprint
- `GET /api/conversations` - List user conversations

### Rate Limits
- AI Generation: 5 requests/minute
- Authenticated API: 60 requests/minute
- Public API: 30 requests/minute

## 🏗️ Architecture

### High-Level Overview
```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Next.js   │────▶│   API Routes │────▶│  PostgreSQL │
│   Frontend  │     │   (Node.js)  │     │  + pgvector │
└─────────────┘     └──────────────┘     └─────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  AI Services │
                    │  Gemini + GPT│
                    └──────────────┘
```

### Data Flow
1. User submits idea through chat interface
2. AI generates comprehensive blueprint
3. Blueprint stored with vector embeddings for RAG
4. Landing page generated from blueprint
5. Analytics tracked in real-time
6. Validation sprint tasks created
7. AI co-founder provides ongoing guidance

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Workflow
1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Code Standards
- Follow the existing code style
- Write meaningful commit messages
- Add tests for new features
- Update documentation as needed

## 📝 License

This project is proprietary software. All rights reserved.

## 👥 Team

Created with ❤️ by the NeuraLaunch team

## 🙏 Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- UI components from [shadcn/ui](https://ui.shadcn.com/)
- Powered by [Google Gemini](https://deepmind.google/technologies/gemini/)
- Database by [Prisma](https://www.prisma.io/)

## 📞 Support

- **Documentation**: [DEPLOYMENT.md](./DEPLOYMENT.md)
- **Health Check**: `https://yourdomain.com/api/health`
- **Issues**: [GitHub Issues](https://github.com/mansaraysaheedalpha/neuralaunch/issues)

---

<div align="center">
  <strong>Built for founders, by founders. 🚀</strong>
</div>
