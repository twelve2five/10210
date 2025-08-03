"""
Database migration system for WhatsApp Agent
Handles database schema updates and versioning
"""

import os
import logging
from datetime import datetime
from sqlalchemy import text
from .connection import get_db, engine

logger = logging.getLogger(__name__)

class DatabaseMigration:
    """Handle database migrations and schema updates"""
    
    def __init__(self):
        self.migrations = []
        self._register_migrations()
    
    def _register_migrations(self):
        """Register all available migrations"""
        self.migrations = [
            {
                "version": "001",
                "name": "create_initial_tables",
                "description": "Create campaigns, deliveries, and analytics tables",
                "sql": self._migration_001_initial_tables()
            },
            {
                "version": "002", 
                "name": "add_sample_support",
                "description": "Add message sample support to campaigns",
                "sql": self._migration_002_sample_support()
            },
            {
                "version": "003",
                "name": "add_performance_indexes",
                "description": "Add performance indexes and views",
                "sql": self._migration_003_performance_indexes()
            },
            {
                "version": "004",
                "name": "add_column_mapping",
                "description": "Add column_mapping field for CSV field mapping",
                "sql": self._migration_004_column_mapping()
            },
            {
                "version": "005",
                "name": "add_error_details",
                "description": "Add error_details field for better error tracking",
                "sql": self._migration_005_error_details()
            },
            {
                "version": "006",
                "name": "add_condition_filters",
                "description": "Add condition filters for excluding contacts",
                "sql": self._migration_006_condition_filters()
            },
            {
                "version": "007",
                "name": "add_warmer_tables",
                "description": "Add WhatsApp warmer tables for account warming",
                "sql": self._migration_007_warmer_tables()
            }
        ]
    
    def _migration_001_initial_tables(self) -> str:
        """Migration 001: Create initial tables"""
        return """
        -- Create campaigns table
        CREATE TABLE IF NOT EXISTS campaigns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name VARCHAR(255) NOT NULL,
            session_name VARCHAR(100) NOT NULL,
            status VARCHAR(50) DEFAULT 'created',
            file_path VARCHAR(500),
            start_row INTEGER DEFAULT 1,
            end_row INTEGER,
            message_mode VARCHAR(20) DEFAULT 'single',
            message_samples TEXT,
            use_csv_samples BOOLEAN DEFAULT FALSE,
            delay_seconds INTEGER DEFAULT 5,
            retry_attempts INTEGER DEFAULT 3,
            total_rows INTEGER DEFAULT 0,
            processed_rows INTEGER DEFAULT 0,
            success_count INTEGER DEFAULT 0,
            error_count INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            started_at TIMESTAMP,
            completed_at TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        -- Create deliveries table
        CREATE TABLE IF NOT EXISTS deliveries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
            row_number INTEGER NOT NULL,
            phone_number VARCHAR(20) NOT NULL,
            recipient_name VARCHAR(255),
            selected_sample_index INTEGER,
            selected_sample_text TEXT,
            final_message_content TEXT,
            variable_data TEXT,
            status VARCHAR(50) DEFAULT 'pending',
            sent_at TIMESTAMP,
            delivered_at TIMESTAMP,
            error_message TEXT,
            whatsapp_message_id VARCHAR(255),
            retry_count INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        -- Create analytics table
        CREATE TABLE IF NOT EXISTS campaign_analytics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
            sample_index INTEGER,
            sample_text TEXT,
            usage_count INTEGER DEFAULT 0,
            success_count INTEGER DEFAULT 0,
            delivery_count INTEGER DEFAULT 0,
            response_count INTEGER DEFAULT 0,
            error_count INTEGER DEFAULT 0,
            avg_delivery_time REAL,
            response_rate REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """
    
    def _migration_002_sample_support(self) -> str:
        """Migration 002: Add message sample support"""
        return """
        -- Add max_daily_messages column if not exists
        ALTER TABLE campaigns ADD COLUMN max_daily_messages INTEGER DEFAULT 1000;
        
        -- Create migration tracking table
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version VARCHAR(10) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """
    
    def _migration_003_performance_indexes(self) -> str:
        """Migration 003: Add performance indexes"""
        return """
        -- Create performance indexes
        CREATE INDEX IF NOT EXISTS idx_campaigns_name ON campaigns(name);
        CREATE INDEX IF NOT EXISTS idx_campaigns_session ON campaigns(session_name);
        CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
        CREATE INDEX IF NOT EXISTS idx_deliveries_campaign ON deliveries(campaign_id);
        CREATE INDEX IF NOT EXISTS idx_deliveries_phone ON deliveries(phone_number);
        CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);
        
        -- Create update triggers
        CREATE TRIGGER IF NOT EXISTS update_campaigns_timestamp 
        AFTER UPDATE ON campaigns
        BEGIN
            UPDATE campaigns SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
        END;
        
        CREATE TRIGGER IF NOT EXISTS update_deliveries_timestamp 
        AFTER UPDATE ON deliveries
        BEGIN
            UPDATE deliveries SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
        END;
        """
    
    def _migration_004_column_mapping(self) -> str:
        """Migration 004: Add column_mapping field"""
        return """
        -- Add column_mapping column to campaigns table
        ALTER TABLE campaigns ADD COLUMN column_mapping TEXT;
        """
    
    def _migration_005_error_details(self) -> str:
        """Migration 005: Add error_details field"""
        return """
        -- Add error_details column to campaigns table
        ALTER TABLE campaigns ADD COLUMN error_details TEXT;
        """
    
    def _migration_006_condition_filters(self) -> str:
        """Migration 006: Add condition filters"""
        return """
        -- Add condition filter columns to campaigns table
        ALTER TABLE campaigns ADD COLUMN exclude_my_contacts BOOLEAN DEFAULT 0;
        ALTER TABLE campaigns ADD COLUMN exclude_previous_conversations BOOLEAN DEFAULT 0;
        """
    
    def _migration_007_warmer_tables(self) -> str:
        """Migration 007: Add WhatsApp warmer tables"""
        return """
        -- Create warmer_sessions table
        CREATE TABLE IF NOT EXISTS warmer_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name VARCHAR(255) NOT NULL,
            orchestrator_session VARCHAR(100) NOT NULL,
            participant_sessions TEXT NOT NULL,
            status VARCHAR(50) DEFAULT 'inactive',
            group_message_delay_min INTEGER DEFAULT 30,
            group_message_delay_max INTEGER DEFAULT 1800,
            direct_message_delay_min INTEGER DEFAULT 120,
            direct_message_delay_max INTEGER DEFAULT 1800,
            total_groups_created INTEGER DEFAULT 0,
            total_messages_sent INTEGER DEFAULT 0,
            total_group_messages INTEGER DEFAULT 0,
            total_direct_messages INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            started_at TIMESTAMP,
            stopped_at TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        -- Create warmer_groups table
        CREATE TABLE IF NOT EXISTS warmer_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            warmer_session_id INTEGER NOT NULL REFERENCES warmer_sessions(id) ON DELETE CASCADE,
            group_id VARCHAR(255) NOT NULL,
            group_name VARCHAR(255),
            members TEXT NOT NULL,
            last_message_at TIMESTAMP,
            message_count INTEGER DEFAULT 0,
            last_speaker VARCHAR(100),
            is_active BOOLEAN DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        -- Create warmer_conversations table
        CREATE TABLE IF NOT EXISTS warmer_conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            warmer_session_id INTEGER NOT NULL REFERENCES warmer_sessions(id) ON DELETE CASCADE,
            message_id VARCHAR(255),
            sender_session VARCHAR(100) NOT NULL,
            recipient_session VARCHAR(100),
            group_id VARCHAR(255),
            message_type VARCHAR(20) NOT NULL,
            message_content TEXT NOT NULL,
            context_summary TEXT,
            sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        -- Create warmer_contacts table
        CREATE TABLE IF NOT EXISTS warmer_contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            warmer_session_id INTEGER NOT NULL REFERENCES warmer_sessions(id) ON DELETE CASCADE,
            session_name VARCHAR(100) NOT NULL,
            contact_phone VARCHAR(20) NOT NULL,
            contact_name VARCHAR(255),
            saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(warmer_session_id, session_name, contact_phone)
        );
        
        -- Create indexes
        CREATE INDEX IF NOT EXISTS idx_warmer_sessions_status ON warmer_sessions(status);
        CREATE INDEX IF NOT EXISTS idx_warmer_groups_session ON warmer_groups(warmer_session_id);
        CREATE INDEX IF NOT EXISTS idx_warmer_groups_active ON warmer_groups(is_active);
        CREATE INDEX IF NOT EXISTS idx_warmer_conversations_session ON warmer_conversations(warmer_session_id);
        CREATE INDEX IF NOT EXISTS idx_warmer_conversations_type ON warmer_conversations(message_type);
        CREATE INDEX IF NOT EXISTS idx_warmer_conversations_sent ON warmer_conversations(sent_at);
        CREATE INDEX IF NOT EXISTS idx_warmer_contacts_session ON warmer_contacts(warmer_session_id);
        """
    
    def get_current_version(self) -> str:
        """Get current database schema version"""
        try:
            with get_db() as db:
                # Check if migrations table exists
                result = db.execute(text("""
                    SELECT name FROM sqlite_master 
                    WHERE type='table' AND name='schema_migrations'
                """)).fetchone()
                
                if not result:
                    return "000"  # No migrations table, start from beginning
                
                # Get latest migration version
                result = db.execute(text("""
                    SELECT version FROM schema_migrations 
                    ORDER BY version DESC LIMIT 1
                """)).fetchone()
                
                return result[0] if result else "000"
                
        except Exception as e:
            logger.error(f"Error getting current version: {str(e)}")
            return "000"
    
    def run_migration(self, migration: dict) -> bool:
        """Run a specific migration"""
        try:
            with get_db() as db:
                # Execute migration SQL
                for statement in migration["sql"].split(";"):
                    statement = statement.strip()
                    if statement:
                        db.execute(text(statement))
                
                # Record migration
                db.execute(text("""
                    INSERT OR REPLACE INTO schema_migrations (version, name) 
                    VALUES (:version, :name)
                """), {
                    "version": migration["version"],
                    "name": migration["name"]
                })
                
                logger.info(f"Migration {migration['version']} - {migration['name']} completed successfully")
                return True
                
        except Exception as e:
            logger.error(f"Migration {migration['version']} failed: {str(e)}")
            return False
    
    def migrate_to_latest(self) -> bool:
        """Run all pending migrations"""
        current_version = self.get_current_version()
        logger.info(f"Current database version: {current_version}")
        
        pending_migrations = [
            m for m in self.migrations 
            if m["version"] > current_version
        ]
        
        if not pending_migrations:
            logger.info("Database is up to date")
            return True
        
        logger.info(f"Running {len(pending_migrations)} pending migrations...")
        
        for migration in pending_migrations:
            if not self.run_migration(migration):
                logger.error(f"Migration failed at version {migration['version']}")
                return False
        
        logger.info("All migrations completed successfully")
        return True
    
    def get_migration_status(self) -> dict:
        """Get migration status information"""
        current_version = self.get_current_version()
        latest_version = self.migrations[-1]["version"] if self.migrations else "000"
        
        return {
            "current_version": current_version,
            "latest_version": latest_version,
            "is_up_to_date": current_version >= latest_version,
            "total_migrations": len(self.migrations),
            "pending_migrations": len([
                m for m in self.migrations 
                if m["version"] > current_version
            ])
        }

def initialize_database():
    """Initialize database with latest schema"""
    try:
        # Import models to ensure SQLAlchemy creates tables
        from . import models
        from .connection import Base, engine
        
        # Create all tables using SQLAlchemy
        Base.metadata.create_all(bind=engine)
        
        # Run migrations to ensure schema is up to date
        migrator = DatabaseMigration()
        success = migrator.migrate_to_latest()
        
        if success:
            logger.info("Database initialization completed successfully")
        else:
            logger.error("Database initialization failed during migrations")
            
        return success
        
    except Exception as e:
        logger.error(f"Database initialization failed: {str(e)}")
        return False

def reset_database():
    """Reset database (DANGER: This will delete all data!)"""
    try:
        from .connection import DATABASE_PATH
        
        if os.path.exists(DATABASE_PATH):
            os.remove(DATABASE_PATH)
            logger.info("Database file deleted")
        
        return initialize_database()
        
    except Exception as e:
        logger.error(f"Database reset failed: {str(e)}")
        return False
