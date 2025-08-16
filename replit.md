# Overview

This is a Tutoring Club Parent Portal - a full-stack TypeScript web application that allows parents to view their children's tutoring information, manage schedules, and handle billing. The application is built as a modern monorepo with a React frontend, Express.js backend, and shared schema definitions.

The portal provides functionality for parent authentication using email and phone number credentials, student overview with progress tracking, session scheduling and change requests, and billing management. The system was migrated from a legacy Flask/SQL Server application to a modern TypeScript stack while maintaining connection to the existing SQL Server database.

# User Preferences

Preferred communication style: Simple, everyday language.
Data loading priority: Students first (immediate), sessions second (on-demand), billing last (tab-specific only).

## Recent Changes (August 2025)
- Updated authentication system to use email as username and phone number as password
- Connected to existing SQL Server database using legacy table structure (tblInquiry, tblstudents, tblSessionSchedule)
- Implemented SQL Server storage functions with error handling for stored procedures
- Added Tutoring Club branding with official logo and color scheme
- Implemented client-side email system with Gmail web interface priority for schedule change requests
- Removed server-side email submission, replaced with EmailButton component that opens user's email client
- Added franchise email lookup using SQL query: SELECT FranchiesEmail FROM tblFranchies WHERE ID IN (SELECT FranchiesID FROM tblInquiry WHERE ID = @InquiryID)
- Email button automatically fetches franchise email when student is selected
- Prioritized Gmail app on mobile with iframe detection, Gmail web interface on desktop, optimized for preview environments
- Optimized login performance by splitting dashboard data into separate endpoints with proper loading sequence
- Reduced initial login time by loading only essential student data first (9ms vs 20+ seconds)
- Implemented optimized data loading sequence: inquiry ID → students → sessions (recent & upcoming) → billing last
- Sessions now load immediately when student is selected with separate recent/upcoming endpoints
- Fixed session data display issues - both recent and upcoming sessions now show properly

# System Architecture

## Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for fast development and optimized builds
- **UI Library**: Radix UI components with shadcn/ui for accessible, customizable components
- **Styling**: Tailwind CSS with custom design tokens for the Tutoring Club brand
- **State Management**: TanStack Query (React Query) for server state management
- **Routing**: Wouter for lightweight client-side routing
- **Form Handling**: React Hook Form with Zod validation

## Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **Database ORM**: Drizzle ORM configured for PostgreSQL
- **Session Management**: Express sessions with configurable storage
- **Development**: Hot reload with tsx for TypeScript execution

## Authentication & Authorization
- **Session-Based Auth**: Uses express-session middleware for maintaining user sessions
- **Phone Number Login**: Parents authenticate using their contact phone number
- **Session Storage**: Configurable session store (memory for development, can be extended to PostgreSQL)
- **Route Protection**: Middleware-based authentication checks for protected endpoints

## Data Layer
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Definition**: Centralized in shared package with Zod validation
- **Migration Management**: Drizzle Kit for database migrations
- **Connection**: Uses @neondatabase/serverless for PostgreSQL connectivity

## API Design
- **RESTful Endpoints**: Express.js routes for authentication, dashboard data, and schedule management
- **Type Safety**: Shared Zod schemas ensure type safety between frontend and backend
- **Error Handling**: Centralized error handling with appropriate HTTP status codes
- **Request Validation**: Zod schemas validate all incoming requests

## Development Setup
- **Monorepo Structure**: Separate client, server, and shared packages
- **Hot Reload**: Vite dev server for frontend, tsx for backend development
- **Path Mapping**: TypeScript path aliases for clean imports
- **Build Process**: Separate build commands for each package with optimized outputs

# External Dependencies

## Database Services
- **PostgreSQL**: Primary database (configured for Neon serverless)
- **Drizzle ORM**: Type-safe database queries and migrations
- **Connection Pooling**: Built-in with @neondatabase/serverless

## UI & Design System
- **Radix UI**: Headless UI components for accessibility
- **Tailwind CSS**: Utility-first CSS framework
- **Lucide React**: Icon library for consistent iconography
- **shadcn/ui**: Pre-built component library based on Radix UI

## Development Tools
- **TypeScript**: Static type checking across the entire stack
- **Vite**: Frontend build tool and development server
- **tsx**: TypeScript execution for Node.js development
- **ESBuild**: Production bundling for the backend

## State Management & Data Fetching
- **TanStack Query**: Server state management with caching and synchronization
- **React Hook Form**: Form state management with validation
- **Zod**: Runtime type validation and schema definition

## Legacy System Integration
- **SQL Server Support**: Original system used SQL Server with pymssql
- **Data Migration**: Schema designed to accommodate existing data structure
- **Authentication Compatibility**: Phone-based login maintains compatibility with existing user base