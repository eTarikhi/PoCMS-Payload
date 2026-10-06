#!/usr/bin/env node
/**
 * Payload CMS Custom Bin Script: Database Seeding
 * 
 * Usage: pnpm seed
 * or:    npm run seed
 * 
 * Environment Variables:
 * - PAYLOAD_SECRET: Required. Secret key for Payload CMS security
 * - POSTGRES_URL: Database connection string
 * 
 * This script follows the Payload CMS documentation:
 * https://payloadcms.com/docs/configuration/overview#custom-bin-scripts
 */

import 'dotenv/config.js'
import { getPayload } from 'payload'
import type { PayloadRequest } from 'payload'
import config from '../payload.config.js'
import {seed} from './index'

const run = async () => {
  // Check if PAYLOAD_SECRET is set
  if (!process.env.PAYLOAD_SECRET) {
    console.error('\n❌ Error: PAYLOAD_SECRET environment variable is not set.')
    console.error('\nPlease set your secret key in one of the following ways:\n')
    console.error('1. Add to your .env file:')
    console.error('   PAYLOAD_SECRET=your_secret_key_here\n')
    console.error('2. Export before running the script:')
    console.error('   export PAYLOAD_SECRET=your_secret_key_here')
    console.error('   pnpm seed\n')
    console.error('3. Set inline:')
    console.error('   PAYLOAD_SECRET=your_secret_key_here pnpm seed\n')
    console.error('💡 Generate a secure key with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"')
    process.exit(1)
  }

  // Check if POSTGRES_URL is set
  if (!process.env.POSTGRES_URL) {
    console.error('\n❌ Error: POSTGRES_URL environment variable is not set.')
    console.error('\nPlease add your database connection string to your .env file:')
    console.error('   POSTGRES_URL=postgresql://user:password@host/database\n')
    process.exit(1)
  }

  try {
    console.log('\n🚀 Initializing Payload CMS...')
    console.log('📦 Database:', process.env.POSTGRES_URL.split('@')[1] || 'Vercel Neon')
    console.log()

    const payload = await getPayload({
      config,
    })

    console.log('✅ Payload CMS initialized successfully\n')
    console.log('📊 Starting database seed...\n')

    // Create a minimal PayloadRequest object for seeding
    const req = {
      payloadAPI: 'local',
      user: null,
    } as PayloadRequest

    await seed({
      payload,
      req,
    })

    console.log('\n✨ Seed completed successfully!')
    console.log('🎉 Your portfolio database is now populated with data!\n')
    process.exit(0)
  } catch (error) {
    console.error('\n❌ Error seeding database:')
    
    if (error instanceof Error) {
      console.error(`\n📍 ${error.message}\n`)
      
      // Check for common connection errors
      if (error.message.includes('ECONNREFUSED')) {
        console.error('💡 Tip: Could not connect to database.')
        console.error('   Make sure your POSTGRES_URL is correct and the database is accessible.\n')
      } else if (error.message.includes('connect ETIMEDOUT')) {
        console.error('💡 Tip: Connection timeout.')
        console.error('   Check your internet connection and database URL.\n')
      } else if (error.message.includes('Failed query')) {
        console.error('💡 Tip: Database schema issue.')
        console.error('   Try running: pnpm generate:all\n')
      }
      
      if (error.stack) {
        console.error('Stack trace:')
        console.error(error.stack)
      }
    } else {
      console.error(String(error))
    }
    
    process.exit(1)
  }
}

run()
