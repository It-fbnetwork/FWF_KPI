# Migration Scope

Core collections/tables in scope:

1. users
2. people
3. company_teams
4. workspace_teams
5. tasks
6. document_folders
7. documents
8. learning_quizzes
9. quiz_attempts
10. learning_progress
11. chat_threads
12. chat_messages
13. schedules
14. tests
15. person_notifications
16. pending_registrations
17. pending_login_otps
18. role_approval_requests
19. uploads.files (metadata)

Out of current automated import:
- uploads.chunks binary data (must be migrated to Supabase Storage with separate streaming script)
