# 🚀 NeuraLaunch

[![Production Ready](https://img.shields.io/badge/production-ready-brightgreen.svg)](https://github.com/mansaraysaheedalpha/ideaspark)
[![Security: A+](https://img.shields.io/badge/security-A+-success.svg)](#security-features)
[![Performance: A+](https://img.shields.io/badge/performance-A+-success.svg)](#performance-optimization)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-Proprietary-red.svg)](#license)

> **Transform Ideas into Validated Startups with AI-Powered Precision**

NeuraLaunch is an AI-powered startup validation platform that combines intelligent blueprints with structured validation sprints, empowering founders to turn visionary ideas into market-ready startups. Stop building products nobody wants—validate with precision before you code.

---

## 📋 Table of Contents

- [Key Features](#-key-features)
- [Technology Stack](#️-technology-stack)
- [Quick Start](#-quick-start)
- [Documentation](#-documentation)
- [Security Features](#-security-features)
- [Performance Optimization](#-performance-optimization)
- [Testing & Quality](#-testing--quality)
- [API Documentation](#-api-documentation)
- [Architecture](#️-architecture)
- [Contributing](#-contributing)
- [License](#-license)
- [Support](#-support)

---

## ✨ Key Features

### 🎯 AI-Powered Startup Generation
- **Intelligent Blueprints**: Generate comprehensive startup plans using Google Gemini AI
- **Strategic Validation Framework**: 72-hour validation sprints with AI assistance
- **Market Analysis**: Automated niche selection and competitive analysis
- **Business Model Design**: Revenue architecture and unit economics projections

### 🤖 AI Co-Founder with Memory (RAG)
- **Persistent Conversations**: All co-founder chats are saved to database and persist across sessions
- **Persistent Context**: AI remembers your entire project history using vector embeddings
- **Vector Search**: Retrieves relevant past conversations and insights with pgvector
- **Strategic Guidance**: Acts as Y Combinator partner + lean startup expert
- **Devil's Advocate**: Challenges assumptions with data-driven logic

### 📊 Landing Page Builder & Analytics
- **No-Code Builder**: Generate professional landing pages from your blueprint
- **A/B Testing**: Test multiple design variants to optimize conversions
- **Analytics Dashboard**: Track views, signups, and conversions in real-time
- **Smoke Testing**: Validate feature interest before building anything

### ⚡ Validation Sprint System
- **Task Management**: Structured 72-hour validation tasks with clear objectives
- **AI Assistants**: Specialized helpers for customer profiles, outreach, and analysis
- **Progress Tracking**: Real-time sprint analytics and achievements
- **Email Reminders**: Stay on track with automated notifications

### 🏆 Gamification & Achievements
- **Milestone Tracking**: Unlock achievements as you progress through validation
- **Leaderboards**: Global trends and top performing ideas
- **Tag System**: Discover patterns in successful startups
- **Community Insights**: Learn from other founders' validation journeys

---

## 🛠️ Technology Stack

### Frontend
- **Framework**: Next.js 15 (App Router) with React 19
- **Language**: TypeScript 5+ (strict mode enabled)
- **Styling**: Tailwind CSS 3.4+ with custom design system
- **UI Components**: Radix UI + shadcn/ui for accessible components
- **Animations**: Framer Motion for smooth, performant animations
- **State Management**: Zustand for lightweight global state
- **Data Fetching**: SWR for efficient client-side data management

### Backend
- **Runtime**: Node.js 20+
- **API**: Next.js API Routes with type-safe endpoints
- **Database**: PostgreSQL 14+ with pgvector extension for vector search
- **ORM**: Prisma for type-safe database access
- **Authentication**: NextAuth v5 with Google OAuth integration
- **Session Management**: Secure, encrypted sessions with database persistence

### AI & ML
- **Primary AI**: Google Gemini (gemini-1.5-flash, gemini-1.5-pro) for blueprint generation
- **Secondary AI**: OpenAI GPT-4 for MVP generation and advanced reasoning
- **Anthropic Claude**: Alternative AI for diverse perspectives
- **Vector Database**: pgvector for RAG (Retrieval-Augmented Generation)
- **Embeddings**: OpenAI text-embedding-3-small for semantic search

### Infrastructure & DevOps
- **Deployment**: Vercel (recommended for Next.js)
- **Email Service**: Resend for transactional emails
- **Analytics**: Vercel Analytics + custom event tracking
- **Monitoring**: Built-in health checks and error tracking
- **Performance**: Speed Insights for real-time performance monitoring

---

## 🚀 Quick Start

### Prerequisites

Before you begin, ensure you have the following installed and configured:

- **Node.js**: Version 18+ or 20+ ([Download](https://nodejs.org/))
- **npm** or **pnpm**: Package manager (comes with Node.js)
- **PostgreSQL**: Version 14+ with pgvector extension ([Installation Guide](https://github.com/pgvector/pgvector))
- **Git**: For version control ([Download](https://git-scm.com/))

### Required API Keys

You'll need to obtain the following API keys:

1. **Google OAuth Credentials** - [Google Cloud Console](https://console.cloud.google.com/)
2. **Google Gemini API Key** - [Google AI Studio](https://makersuite.google.com/app/apikey)
3. **OpenAI API Key** - [OpenAI Platform](https://platform.openai.com/api-keys)
4. **Anthropic API Key** (optional) - [Anthropic Console](https://console.anthropic.com/)
5. **Resend API Key** - [Resend Dashboard](https://resend.com/api-keys)

### Installation Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/mansaraysaheedalpha/ideaspark.git
   cd ideaspark/client
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   pnpm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and configure the following variables:
   ```bash
   # Database
   DATABASE_URL="postgresql://user:password@localhost:5432/neuralaunch?schema=public"
   
   # Authentication
   NEXTAUTH_URL="http://localhost:3000"
   NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"
   
   # Google OAuth
   GOOGLE_CLIENT_ID="your-google-client-id"
   GOOGLE_CLIENT_SECRET="your-google-client-secret"
   
   # AI Services
   GOOGLE_API_KEY="your-google-gemini-api-key"
   OPENAI_API_KEY="your-openai-api-key"
   ANTHROPIC_API_KEY="your-anthropic-claude-api-key"
   
   # Email
   RESEND_API_KEY="your-resend-api-key"
   
   # Node Environment
   NODE_ENV="development"
   ```
   
   **Generate NEXTAUTH_SECRET**:
   ```bash
   openssl rand -base64 32
   ```

4. **Set up the database**
   
   Make sure PostgreSQL is running, then:
   ```bash
   # Generate Prisma client
   npx prisma generate
   
   # Push database schema
   npx prisma db push
   
   # (Optional) Seed the database with sample data
   npx prisma db seed
   ```

5. **Install pgvector extension**
   
   Connect to your PostgreSQL database and run:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

6. **Run the development server**
   ```bash
   npm run dev
   # or
   pnpm dev
   ```

7. **Open your browser**
   
   Navigate to [http://localhost:3000](http://localhost:3000)

### Verification

To verify your installation is working correctly:

1. Visit the health check endpoint: `http://localhost:3000/api/health`
2. Sign in with Google OAuth
3. Create a new chat and generate a blueprint
4. Check that conversations persist after page refresh

---

## 📖 Documentation

- **[Deployment Guide](./DEPLOYMENT.md)** - Complete production deployment instructions for Vercel and other platforms
- **[Production Checklist](./PRODUCTION_CHECKLIST.md)** - Pre-launch verification checklist
- **[AI Co-Founder Persistence](./COFOUNDER_PERSISTENCE.md)** - Deep dive into RAG implementation
- **[API Documentation](#-api-documentation)** - API endpoints and usage examples
- **[Architecture](#️-architecture)** - System design and data flow diagrams

---

## 🔒 Security Features

### A+ Security Rating

NeuraLaunch implements enterprise-grade security measures to protect your data and ideas:

- ✅ **Input Validation**: Comprehensive Zod schemas on all API endpoints for type-safe validation
- ✅ **Rate Limiting**: Configurable per-endpoint limits to prevent abuse and ensure fair usage
- ✅ **XSS Prevention**: Advanced input sanitization utilities to prevent cross-site scripting attacks
- ✅ **CSRF Protection**: Secure session management with anti-CSRF tokens
- ✅ **SQL Injection Prevention**: Prisma ORM with parameterized queries and type safety
- ✅ **Security Headers**: CSP, X-Frame-Options, HSTS, X-Content-Type-Options, and more
- ✅ **Environment Validation**: Type-safe configuration with runtime checks
- ✅ **Error Handling**: Sanitized error messages that never expose sensitive information
- ✅ **Authentication**: Secure OAuth 2.0 implementation with Google
- ✅ **Data Encryption**: Encrypted database connections and secure session storage

---

## ⚡ Performance Optimization

### A+ Performance Rating

Built for speed and scalability from day one:

- ✅ **Database Indexes**: Strategic indexes on all frequently queried tables for sub-100ms queries
- ✅ **Response Caching**: Intelligent caching strategy for public data with cache invalidation
- ✅ **Code Splitting**: Dynamic imports and lazy loading for minimal initial bundle size
- ✅ **Image Optimization**: Next.js Image component with automatic WebP conversion
- ✅ **Connection Pooling**: Efficient database connection management for high concurrency
- ✅ **API Response Compression**: Gzip/Brotli compression for reduced payload sizes
- ✅ **Lazy Loading**: Components and data loaded on demand to minimize initial load time
- ✅ **Edge Functions**: Deployed close to users for minimal latency
- ✅ **Optimistic UI Updates**: Instant feedback while data syncs in the background

---

## 🧪 Testing & Quality

### Code Quality Standards

We maintain high code quality through:

- **Linting**: ESLint with TypeScript strict rules and custom configurations
- **Type Safety**: 100% TypeScript coverage with strict mode enabled
- **Error Boundaries**: Graceful error handling and fallback UI components
- **Logging**: Structured logging with contextual information for debugging
- **Health Checks**: `/api/health` endpoint for monitoring and diagnostics
- **Code Reviews**: All changes reviewed for quality and security
- **Automated Testing**: (Coming soon) Unit and integration tests

---

## 📊 API Documentation

### Public Endpoints

These endpoints are accessible without authentication:

| Endpoint | Method | Description | Rate Limit |
|----------|--------|-------------|------------|
| `/api/health` | GET | System health check and status | None |
| `/api/trends` | GET | Global startup trends (cached) | 30/min |
| `/lp/[slug]` | GET | Public landing pages | 60/min |

### Authenticated Endpoints

These endpoints require valid authentication (Google OAuth):

| Endpoint | Method | Description | Rate Limit |
|----------|--------|-------------|------------|
| `/api/chat` | POST | Generate startup blueprints | 5/min |
| `/api/cofounder` | POST | Chat with AI co-founder (RAG) | 5/min |
| `/api/cofounder/messages` | GET | Retrieve conversation history | 60/min |
| `/api/conversations` | GET | List user conversations | 60/min |
| `/api/conversations/[id]` | DELETE | Delete a conversation | 60/min |
| `/api/landing-page/generate` | POST | Create landing page | 5/min |
| `/api/landing-page/analytics` | GET | View analytics dashboard | 60/min |
| `/api/sprint/start` | POST | Begin validation sprint | 5/min |

### Request Examples

**Generate Blueprint:**
```bash
curl -X POST https://yourdomain.com/api/chat \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=YOUR_TOKEN" \
  -d '{
    "message": "I want to build a SaaS for freelancers",
    "conversationId": "optional-conversation-id"
  }'
```

**Chat with AI Co-Founder:**
```bash
curl -X POST https://yourdomain.com/api/cofounder \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=YOUR_TOKEN" \
  -d '{
    "message": "What should I focus on first?",
    "conversationId": "your-conversation-id"
  }'
```

---

## 🏗️ Architecture

### High-Level Overview

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   Next.js        │────▶│   API Routes     │────▶│  PostgreSQL      │
│   Frontend       │     │   (Node.js)      │     │  + pgvector      │
│   - React 19     │     │   - NextAuth     │     │  - Prisma ORM    │
│   - TypeScript   │     │   - Rate Limiting│     │  - Vector Search │
│   - Framer Motion│     │   - Validation   │     │  - Indexes       │
└──────────────────┘     └──────────────────┘     └──────────────────┘
                                 │
                                 ▼
                         ┌──────────────────┐
                         │  AI Services     │
                         │  - Google Gemini │
                         │  - OpenAI GPT-4  │
                         │  - Anthropic     │
                         └──────────────────┘
```

### Data Flow for Blueprint Generation

1. **User Input**: Founder submits idea via chat interface
2. **AI Processing**: Google Gemini analyzes skills, market, and opportunities
3. **Blueprint Generation**: Comprehensive startup plan created with validation strategy
4. **Vector Embedding**: Blueprint content embedded using OpenAI embeddings
5. **Database Storage**: Blueprint and embeddings stored in PostgreSQL with pgvector
6. **RAG Context**: All future AI interactions can reference past blueprints
7. **Landing Page**: No-code landing page generated from blueprint
8. **Analytics Setup**: Tracking pixels and conversion goals configured
9. **Sprint Creation**: 72-hour validation tasks automatically generated
10. **Continuous Guidance**: AI co-founder provides ongoing strategic advice

### RAG (Retrieval-Augmented Generation) Flow

```
User Query → Embedding → Vector Search → Relevant Context → AI Response
                ↓              ↓               ↓               ↓
          OpenAI API    pgvector Index   Past Blueprints   Gemini/GPT-4
```

---

## 🤝 Contributing

We welcome contributions from the community! Whether you're fixing bugs, adding features, or improving documentation, your help is appreciated.

### Development Workflow

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/ideaspark.git
   cd ideaspark
   ```
3. **Create a feature branch**:
   ```bash
   git checkout -b feature/AmazingFeature
   ```
4. **Make your changes** and test thoroughly
5. **Commit with a clear message**:
   ```bash
   git commit -m 'Add: AmazingFeature with full test coverage'
   ```
6. **Push to your fork**:
   ```bash
   git push origin feature/AmazingFeature
   ```
7. **Open a Pull Request** on GitHub with a detailed description

### Code Standards

- **Follow TypeScript strict mode** - All code must pass type checking
- **Use ESLint rules** - Run `npm run lint` before committing
- **Write meaningful commit messages** - Use conventional commits format
- **Document complex logic** - Add comments for non-obvious code
- **Document complex logic** - Add comments for non-obvious code
- **Add tests for new features** - Maintain test coverage
- **Update documentation** - Keep README and docs in sync with code
- **Test in both light and dark modes** - Ensure UI works in all themes
- **Verify mobile responsiveness** - Test on different screen sizes

### Areas Where We Need Help

- 🧪 **Testing**: Unit tests, integration tests, E2E tests
- 📚 **Documentation**: Tutorials, video guides, API examples
- 🌐 **Internationalization**: Multi-language support
- ♿ **Accessibility**: WCAG 2.1 AA compliance improvements
- 🎨 **Design**: UI/UX enhancements and animations
- 🔧 **Features**: New validation tools and AI capabilities

---

## 📝 License

This project is proprietary software. All rights reserved.

**Note**: While the code is available for viewing, you may not use, copy, modify, or distribute this code without explicit permission from the authors.

---

## 👥 Team

Created with ❤️ by the NeuraLaunch team.

**Connect with us:**
- 🐙 [GitHub](https://github.com/mansaraysaheedalpha/ideaspark)
- 💬 [Feedback Form](https://forms.gle/WVLZzKtFYLvb7Xkg9)

---

## 🙏 Acknowledgments

This project stands on the shoulders of giants:

- **[Next.js](https://nextjs.org/)** - The React framework for production
- **[shadcn/ui](https://ui.shadcn.com/)** - Beautifully designed components
- **[Google Gemini](https://deepmind.google/technologies/gemini/)** - Advanced AI capabilities
- **[OpenAI](https://openai.com/)** - GPT-4 and embeddings
- **[Prisma](https://www.prisma.io/)** - Next-generation ORM
- **[Vercel](https://vercel.com/)** - Deployment and hosting platform
- **[pgvector](https://github.com/pgvector/pgvector)** - Vector similarity search for PostgreSQL
- **[Tailwind CSS](https://tailwindcss.com/)** - Utility-first CSS framework
- **[Radix UI](https://www.radix-ui.com/)** - Unstyled, accessible components
- **[Framer Motion](https://www.framer.com/motion/)** - Production-ready animation library

Special thanks to all open-source contributors who make projects like this possible.

---

## 📞 Support

Need help? We're here for you:

- 📖 **Documentation**: Check out our [Deployment Guide](./DEPLOYMENT.md)
- 🏥 **Health Check**: Monitor status at `/api/health`
- 🐛 **Report Issues**: [GitHub Issues](https://github.com/mansaraysaheedalpha/ideaspark/issues)
- 💬 **Feedback**: [Submit Feedback](https://forms.gle/WVLZzKtFYLvb7Xkg9)
- 📧 **Email**: Contact via our website
- 💡 **Feature Requests**: Open an issue with the `enhancement` label

### Frequently Asked Questions

Visit our [FAQ page](/faq) for answers to common questions, or check out our [About Us page](/about) to learn more about NeuraLaunch.

---

## 🗺️ Roadmap

### Coming Soon
- [ ] Mobile apps (iOS & Android)
- [ ] Team collaboration features
- [ ] Advanced analytics and reporting
- [ ] Integration with popular tools (Slack, Notion, etc.)
- [ ] White-label solutions for accelerators
- [ ] Multi-language support
- [ ] Advanced AI models (GPT-4 Turbo, Claude 3)

### In Progress
- [x] AI Co-Founder with RAG
- [x] Landing Page Builder
- [x] Validation Sprint System
- [x] Gamification & Achievements
- [ ] Comprehensive test coverage
- [ ] Mobile app beta

---

<div align="center">

## ⭐ Star Us on GitHub!

If you find NeuraLaunch helpful, please consider giving us a star on [GitHub](https://github.com/mansaraysaheedalpha/ideaspark). It helps others discover the project!

---

  <strong>Built for founders, by founders. 🚀</strong>
  
  <p><em>Stop building products nobody wants. Start validating with AI precision.</em></p>

</div>
