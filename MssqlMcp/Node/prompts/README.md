# MCP Prompts

This directory contains prompt templates that are automatically discovered and served by the MSSQL MCP server.

## How It Works

The MCP server automatically discovers prompts by scanning this directory for files matching the pattern:

```
prompt-{name}.md
```

Each prompt file:
1. **Name** is extracted from the filename (e.g., `prompt-database-schema.md` → name: `database-schema`)
2. **Description** is extracted from a line starting with `Description:` or a `## Description` header in the file

## Creating a New Prompt

To add a new prompt:

1. Create a markdown file in this directory with the naming pattern `prompt-{your-prompt-name}.md`

2. Add a description line at or near the top of the file:
   ```markdown
   Description: Your prompt description here
   ```
   Or use a header:
   ```markdown
   ## Description
   Your prompt description here
   ```

3. Write your prompt content below (the entire file content will be sent to Claude)

4. Restart the MCP server - your prompt will be automatically discovered!

## Example: Creating a Schema Documentation Prompt

**Filename:** `prompt-database-schema.md`

**Content:**
```markdown
# Database Schema Documentation

Description: Business context, relationships, and rules for the database schema

## Tables

### Users
Stores customer and employee accounts.

**Key Fields:**
- `user_id`: Unique identifier
- `email`: Login credential (must be unique)
- `account_type`: 'customer', 'employee', or 'admin'

**Relationships:**
- `Users.user_id` ← `Orders.customer_id` (one-to-many)
- `Users.user_id` ← `Orders.approved_by` (one-to-many)

**Business Rules:**
- New customers get $5,000 credit limit
- Email verification required before first order
```

## What to Include in Prompts

### ✅ DO Include:
- **Business context** - What the database is for
- **Field meanings** - Business purpose of important fields
- **Relationships** - Foreign key documentation with arrow notation
- **Business rules** - Validation rules, workflows, constraints
- **Special notes** - Edge cases, legacy data, performance considerations
- **Valid values** - Enumerations, status codes, category lists

### ❌ DON'T Include:
- **Technical schema details** - Column types, nullability, defaults (use `describe_table` tool)
- **Current data** - Prompts are static; use tools to query actual data
- **Secrets** - Never include passwords, connection strings, API keys

## Available Prompts

To see all available prompts, clients can call the MCP `prompts/list` method.

## Best Practices

1. **Keep prompts focused** - One prompt per major topic (schema, conventions, workflows)
2. **Use clear structure** - Headers, lists, and tables make information easy to find
3. **Update regularly** - When business rules change, update the prompt
4. **Version control** - Commit prompt files to git so changes are tracked
5. **Review before committing** - Ensure no sensitive information is included

## Technical Details

The prompt discovery happens automatically when:
- The MCP server starts
- A client requests the prompts list (`prompts/list`)
- A client requests a specific prompt (`prompts/get`)

The implementation:
- Scans the `prompts/` directory for `prompt-*.md` files
- Parses the description from each file
- Returns the full file content when requested
