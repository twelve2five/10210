# Concurrent Campaigns Fix

## Problem
Multiple campaigns running simultaneously would fail because they shared:
1. Single MessageProcessor instance
2. Single WAHA client instance
3. Shared state management (active_campaigns, stop_flags)

## Solution Implemented
1. **Isolated WAHA Clients**: Each campaign now gets its own WAHA client instance
2. **Thread-Safe Operations**: Added asyncio.Lock for safe concurrent access
3. **Proper Cleanup**: WAHA clients are cleaned up after campaign completion

## Changes Made

### 1. Added Campaign-Specific WAHA Clients
```python
# Before: Single shared client
self.waha = waha_client or WAHAClient()

# After: Isolated clients per campaign
self.campaign_waha_clients = {}  # campaign_id -> WAHAClient
```

### 2. New Methods
- `_get_campaign_waha_client(campaign_id)`: Get or create isolated client
- `_cleanup_campaign_waha_client(campaign_id)`: Clean up after completion

### 3. Updated Message Sending
```python
# Now uses campaign-specific client
waha_client = self._get_campaign_waha_client(campaign_id)
result = waha_client.send_text(session_name, chat_id, message)
```

### 4. Thread Safety
- Added `self._lock = asyncio.Lock()` 
- Campaign registration is now atomic

## Testing
To test the fix:
1. Start Campaign 1 with session "default"
2. While it's running, start Campaign 2 with session "business"
3. Both should run without interrupting each other

## Rollback
If needed, restore the original:
```bash
cp jobs/processor.py.backup jobs/processor.py
```