# Dreel backend: achievement list

# Dreel backend: achievement list

Last updated: 27 November 2026.

How to read it: `[x]` done, `[~]` partly done (the note says what is missing), `[ ]` not started. The items come from the PRD checklist, in the PRD's module order. "Done" means built AND tested against a real PostgreSQL database in the test environment. Four things were never tested end to end: your real Supabase connection through Prisma 6's engine, the calls to Supabase Storage, the call that blocks a suspended person's sign-in inside Supabase, and sending through a real email provider and domain.

## Summary


| Module                                   |   Done | Partly | Not started |   Total |
| ---------------------------------------- | -----: | -----: | ----------: | ------: |
| 1. User accounts and authentication      |     10 |      2 |           4 |      16 |
| 2. Hospital discovery and search         |     13 |      1 |           5 |      19 |
| 3. Hospital profile management           |      6 |      7 |           4 |      17 |
| 4. Hospital ratings and reviews          |     13 |      2 |           4 |      19 |
| 5. Review verification                   |      2 |      3 |           3 |       8 |
| 6. Hospital rating calculation engine    |      7 |      1 |           0 |       8 |
| 7. Hospital representatives and claiming |      5 |      1 |           4 |      10 |
| 8. Administration and moderation         |      9 |      3 |           5 |      17 |
| 9. Other user-role capabilities          |      4 |      1 |           4 |       9 |
| **All modules**                          | **69** | **21** |      **33** | **123** |

About 56% of the checklist items are done and another 17% are partly done (the count includes two extras that are not in the PRD). All seven roadmap tasks are delivered. The biggest remaining gaps are visit verification, user complaints, and anything involving images.

## Task list (the roadmap)


| #   | Task                                                                                          | Status                                                       |
| --- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1   | API rate limiting                                                                             | Delivered                                                    |
| 2   | Request validation and sanitisation                                                           | Delivered                                                    |
| 3   | Centralised error handling                                                                    | Delivered                                                    |
| 4   | Security hardening: Helmet, CORS, token handling, audit logging, enumeration protection       | Delivered                                                    |
| 5   | User profile and preferences (notifications, language, timezone, theme)                       | Delivered                                                    |
| 6a  | Hospital directory: search, filters, sorting, near-me, details                                | Delivered                                                    |
| 6b  | Reviews, ratings and moderation                                                               | Delivered                                                    |
| 6c  | Claims, verification, representatives, social links, suspension, proof documents              | Delivered                                                    |
| 6c+ | Notifications: in-app list and queued emails through SMTP                                     | Delivered (needs your domain and mailbox to send real email) |
| 6d  | Reports, hospital responses to reviews, moderation history                                    | Delivered                                                    |
| 7   | Role management: admin-only role changes, and a guard that stops the last admin being changed | Delivered                                                    |
| -   | Manual: raise the minimum password length to 8 in the Supabase dashboard                      | Needs doing by you                                           |

### Also delivered, beyond the original list

* Approved hospital response shape (nested `location`, `contact`, `info`; camelCase; arrays kept as arrays).
* Switch from Prisma 7 to Prisma 6.12.0, removing the `pg` adapter.
* Typo-tolerant search with `search.matchType` and `sort=relevance`.
* A conflict-of-interest rule: representatives and pending claimants cannot review their own hospital.
* Document upload with server-side file checks, moderator-only 5-minute links with a fail-closed audit record, 30-day retention and a purge job.
* Notifications and email: queue, retries, templates, settings respected, a log-only mode, and `npm run test:email` for when the domain exists.
* Reports on reviews, hospital responses to reviews and an append-only moderation history (task 6d), including the policy that a report alone never hides a review.
* Account management for administrators: find accounts, change roles, suspend and reactivate, with the last administrator protected by both the app and a database trigger, and `npm run make:admin` for the first administrator.
* A deadlock found and fixed when two moderators approve rival claims at once.
* Swagger documentation for every route.

## Detail by PRD module

### 1. User accounts and authentication

* [X]  Email/password registration. Same response for new and existing emails, so nobody can probe which emails are registered.
* [X]  Email verification. Supabase confirmation email. Reviews and claims need a confirmed email.
* [X]  Login. With login-activity records.
* [X]  Access-token authentication
* [X]  Role-based access control foundation. USER, moderator and admin roles; routes are guarded per role, and admins now manage the roles through the API.

* [\~] Password recovery. The reset email is requested (`/auth/forgot-password`) and Supabase sends it. The backend has no reset-completion endpoint; the reset page uses Supabase directly.
* [\~] Session management. Logout works. No refresh endpoint, and no list or revoke of other sessions.

* [ ]  Change password
* [X]  Update personal information. `PATCH /users/me`, including language, timezone and theme.
* [X]  Manage notification preferences. The switches are saved and now respected: they decide which notifications and emails a person receives.
* [X]  View submitted reviews. `GET /users/me/reviews`.
* [ ]  Manage saved hospitals
* [ ]  Request account deletion. The database already anonymises reviews of deleted accounts, but there is no request endpoint.
* [X]  Login rate limiting and brute-force protection. Only failed logins count toward the limit.
* [ ]  Terms and privacy policy acceptance. Paused, together with age confirmation and onboarding.
* [X]  Registration does not make someone a verified patient. By design: nothing in signup grants any verification.

### 2. Hospital discovery and search

* [X]  Search by hospital name
* [X]  Search by state
* [X]  Search by city
* [X]  Search by LGA
* [ ]  Search by neighbourhood. There is no neighbourhood field, and addresses are not searched.
* [X]  Search by hospital type. `typeId` filter.
* [ ]  Search by available services. Services are shown on a hospital but cannot be searched or filtered yet.

* [\~] Search by rating. Sorting by rating works; a minimum-rating filter does not.

* [ ]  Search by verification status. The status is shown but cannot be filtered on.
* [X]  Filter by ownership
* [ ]  Filter by review count
* [X]  Sort by highest rated. A damped ranking score, so one 5-star review does not outrank a well-reviewed hospital.
* [ ]  Sort by most reviewed
* [X]  Sort by recently added
* [X]  Sort alphabetically
* [X]  Pagination
* [X]  Listing shows rating, review count and verification badge. `rating: { average, count }` and `status`.
* [X]  Extra: near-me search by distance. Not in the PRD list.
* [X]  Extra: typo-tolerant search. "hosptial lagoss" finds Lagos hospitals. Not in the PRD list.

### 3. Hospital profile management

* [X]  Name, description and type. Shown on the profile.
* [ ]  Logo and cover image. Imported images are never shown, and there is no image upload yet.
* [X]  Ownership and year established
* [X]  State, city, LGA, address and coordinates

* [\~] Official phone, email and website. Shown (cleaned from imported data). Representatives cannot edit them yet.

* [X]  Social media links. Typed in by representatives of claimed hospitals only, from six platforms, strictly checked.

* [\~] Emergency, maternity, outpatient, laboratory, imaging, surgery, paediatrics, dental, pharmacy and other services. Shown as a cleaned list from imported data. There is no structured service catalogue yet.
* [\~] Operating hours. Shown from imported data.
* [\~] Available facilities. Shown from imported data, sorted A-Z.

* [X]  Accessibility information

* [\~] HMO acceptance, where verified. Insurance list is shown from imported data; it is not marked as verified.
* [\~] Accreditation, where applicable and verified. Same: shown, not verified.
* [\~] Hospital profile updates. Social links only.

* [ ]  Image uploads
* [ ]  Services and department management
* [ ]  Contact information management
* [X]  Hospital status management. All seven statuses work: unclaimed, claim pending, claimed, verification pending, verified, rejected, suspended.

### 4. Hospital ratings and reviews

* [X]  Submit reviews
* [X]  Overall rating from 1 to 5
* [X]  Category ratings from 1 to 5. All eight PRD categories. Blank categories are allowed and never counted as zero.
* [X]  Review title and written review. Links are refused.
* [X]  Optional visit date. A single date, not a period.
* [X]  Optional department or service visited
* [ ]  Confirmation of genuine personal experience
* [ ]  Acceptance of review guidelines
* [ ]  Optional patient or visit verification status. See module 5.
* [X]  Review moderation before publication. Atomic approve and reject; nobody moderates their own review.

* [\~] Required review statuses. Four exist (pending moderation, published, rejected, removed). The PRD lists nine. Flagged and under-investigation are handled through reports (a published review with open reports), not as review statuses; draft and disputed do not exist.

* [X]  Edit own reviews. An edit goes back to moderation.
* [X]  Delete own reviews
* [X]  Retrieve published reviews

* [\~] Retrieve review history. Your own reviews are listed; there is no edit history.

* [X]  Display reviewer name or permitted pseudonym. Anonymous reviews show "Anonymous".
* [ ]  Display verification label
* [X]  Display hospital representative responses. Shown on the public review once a moderator has approved them.
* [X]  Never expose reviewers' email, phone, medical records or ID. Reviewer emails never appear in any public or moderation review response.

### 5. Review verification

* [ ]  Distinguish unverified reviews from verified-visit reviews
* [ ]  Configurable visit-verification process
* [ ]  Approved evidence methods. The private document storage built for claims can be reused for this.

* [\~] Restrict access to supporting evidence. Built for claim and verification documents (moderators only, every view logged). Not applied to visit evidence yet.
* [\~] Evidence retention and deletion policies. Built for claim and verification documents (30 days after a decision). Not applied to visit evidence yet.
* [\~] Disputed reviews and investigations. Reported reviews are investigated and decided. A reviewer cannot dispute a takedown yet.

* [X]  Email verification does not make someone a verified patient. Respected everywhere.
* [X]  Nobody must upload medical records to review. Nothing like that is asked for.

### 6. Hospital rating calculation engine

* [X]  Calculate hospital overall rating. Arithmetic mean, kept up to date by the database.
* [X]  Calculate category ratings independently. `GET /hospitals/:id/rating-summary`.
* [X]  Count eligible published reviews
* [X]  Update automatically when reviews are published or removed. Database triggers, safe under concurrent changes.
* [X]  Exclude rejected and removed reviews. Only published reviews count.
* [X]  Policy for reviews under investigation. A reported review stays published and counted until a moderator decides; a report alone never hides it. Written down in the README.

* [\~] Exclude duplicate or fraudulent reviews. One review per person per hospital, a daily limit, no links, representatives are blocked, and people can report fake reviews. No automatic fraud detection.

* [X]  Display review counts alongside ratings

### 7. Hospital representatives and claiming

* [X]  Request ownership or management of a hospital. Several people can claim; a moderator decides.
* [X]  Submit verification documents. PDF, JPEG or PNG up to 5 MB, uploaded to a private bucket and checked by the server.

* [\~] Update permitted hospital information. Social links only.

* [ ]  Upload hospital images
* [ ]  Add services and departments
* [X]  Respond publicly to reviews. One response per review, moderator-approved, no links.
* [ ]  View hospital performance analytics
* [X]  Report fraudulent or abusive reviews. Representatives and ordinary users can report, with a reason; representative reports are flagged for moderators.
* [ ]  Manage authorised hospital staff accounts. A hospital has one representative today.
* [X]  Stop representatives manipulating ratings. They cannot review their own hospital, cannot answer their own reviews, have no power to delete or hide any review, and their responses are moderated.

### 8. Administration and moderation

* [X]  Manage user accounts. Admins can search accounts, see activity counts, change roles, suspend and reactivate. They cannot edit another person's profile.

* [\~] Manage hospital listings. Admins can suspend and restore a hospital.

* [X]  Approve or reject hospital verification. With documents required, and every document view logged.
* [ ]  Review submitted feedback
* [X]  Moderate inappropriate content. Review moderation queue.

* [\~] Manage reports and complaints. Reports on reviews are handled. User complaints are not built.

* [X]  Suspend accounts. Takes effect on the person's next request; the reason is recorded and told to them. The last administrator is protected.
* [ ]  Manage platform categories and configuration
* [ ]  View analytics and reports
* [ ]  Platform-wide notifications. The notification system exists; there is no admin tool to send an announcement yet.
* [X]  Review flagged reviews. The report queue lists reported reviews, escalated cases first.
* [X]  Investigate reported content. Mark reports as under investigation; the review stays published meanwhile.
* [X]  Approve or reject reviews
* [X]  Escalate cases to administrators. An escalated case can only be decided by an admin.
* [ ]  Handle user complaints
* [X]  Communicate moderation decisions. Claim, verification and review decisions are sent to the person, in the app and by email, with the moderator's reason when something is rejected.

* [\~] Moderators must not have unrestricted access to sensitive information. Reviewer emails are hidden, document views are logged, and moderators cannot use any account-management tool. Moderators do see the email of a person who made a claim, so they can contact them.

### 9. Other user-role capabilities

* [ ]  Favourite hospital management
* [X]  User review history
* [X]  Notifications. In-app list with unread count, plus emails through SMTP, for claims, verification, suspension and review moderation. Push notifications are not built. Emails need your domain and mailbox before they leave the server.
* [ ]  Privacy preferences. The database column exists; no endpoint uses it.
* [ ]  Hospital performance analytics
* [X]  Hospital representative responses
* [ ]  Hospital staff account management
* [X]  Representative review reports

* [\~] User complaints and moderation decisions. Moderation decisions are recorded in an append-only history and told to the people affected. Complaints are not built.

## Suggested next steps

1. **Go live with email:** buy the domain, create the mailbox, add the DNS records, fill in the SMTP settings and run `npm run test:email` (the README has the checklist). Then make your first administrator with `npm run make:admin`.
2. **Visit verification** (module 5), reusing the private document storage.
3. **Moderator tooling:** notify moderators when new claims, reports and responses arrive, and let people appeal a review takedown or an account suspension.
4. **Hospital profile tools** (module 3 and 7): image uploads, services and departments, editing contact details.
5. **Smaller gaps in search and accounts:** service filter, status filter, most-reviewed sort, change password, saved hospitals, account deletion, user complaints.

# Dreel backend: achievement list

Last updated: 27 November 2026.

How to read it: `[x]` done, `[~]` partly done (the note says what is missing), `[ ]` not started. The items come from the PRD checklist, in the PRD's module order. "Done" means built AND tested against a real PostgreSQL database in the test environment. Four things were never tested end to end: your real Supabase connection through Prisma 6's engine, the calls to Supabase Storage, the call that blocks a suspended person's sign-in inside Supabase, and sending through a real email provider and domain.

## Summary


| Module                                   |   Done | Partly | Not started |   Total |
| ---------------------------------------- | -----: | -----: | ----------: | ------: |
| 1. User accounts and authentication      |     10 |      2 |           4 |      16 |
| 2. Hospital discovery and search         |     13 |      1 |           5 |      19 |
| 3. Hospital profile management           |      6 |      7 |           4 |      17 |
| 4. Hospital ratings and reviews          |     13 |      2 |           4 |      19 |
| 5. Review verification                   |      2 |      3 |           3 |       8 |
| 6. Hospital rating calculation engine    |      7 |      1 |           0 |       8 |
| 7. Hospital representatives and claiming |      5 |      1 |           4 |      10 |
| 8. Administration and moderation         |      9 |      3 |           5 |      17 |
| 9. Other user-role capabilities          |      4 |      1 |           4 |       9 |
| **All modules**                          | **69** | **21** |      **33** | **123** |

About 56% of the checklist items are done and another 17% are partly done (the count includes two extras that are not in the PRD). All seven roadmap tasks are delivered. The biggest remaining gaps are visit verification, user complaints, and anything involving images.

## Task list (the roadmap)


| #   | Task                                                                                          | Status                                                       |
| --- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1   | API rate limiting                                                                             | Delivered                                                    |
| 2   | Request validation and sanitisation                                                           | Delivered                                                    |
| 3   | Centralised error handling                                                                    | Delivered                                                    |
| 4   | Security hardening: Helmet, CORS, token handling, audit logging, enumeration protection       | Delivered                                                    |
| 5   | User profile and preferences (notifications, language, timezone, theme)                       | Delivered                                                    |
| 6a  | Hospital directory: search, filters, sorting, near-me, details                                | Delivered                                                    |
| 6b  | Reviews, ratings and moderation                                                               | Delivered                                                    |
| 6c  | Claims, verification, representatives, social links, suspension, proof documents              | Delivered                                                    |
| 6c+ | Notifications: in-app list and queued emails through SMTP                                     | Delivered (needs your domain and mailbox to send real email) |
| 6d  | Reports, hospital responses to reviews, moderation history                                    | Delivered                                                    |
| 7   | Role management: admin-only role changes, and a guard that stops the last admin being changed | Delivered                                                    |
| -   | Manual: raise the minimum password length to 8 in the Supabase dashboard                      | Needs doing by you                                           |

### Also delivered, beyond the original list

* Approved hospital response shape (nested `location`, `contact`, `info`; camelCase; arrays kept as arrays).
* Switch from Prisma 7 to Prisma 6.12.0, removing the `pg` adapter.
* Typo-tolerant search with `search.matchType` and `sort=relevance`.
* A conflict-of-interest rule: representatives and pending claimants cannot review their own hospital.
* Document upload with server-side file checks, moderator-only 5-minute links with a fail-closed audit record, 30-day retention and a purge job.
* Notifications and email: queue, retries, templates, settings respected, a log-only mode, and `npm run test:email` for when the domain exists.
* Reports on reviews, hospital responses to reviews and an append-only moderation history (task 6d), including the policy that a report alone never hides a review.
* Account management for administrators: find accounts, change roles, suspend and reactivate, with the last administrator protected by both the app and a database trigger, and `npm run make:admin` for the first administrator.
* A deadlock found and fixed when two moderators approve rival claims at once.
* Swagger documentation for every route.

## Detail by PRD module

### 1. User accounts and authentication

* [X]  Email/password registration. Same response for new and existing emails, so nobody can probe which emails are registered.
* [X]  Email verification. Supabase confirmation email. Reviews and claims need a confirmed email.
* [X]  Login. With login-activity records.
* [X]  Access-token authentication
* [X]  Role-based access control foundation. USER, moderator and admin roles; routes are guarded per role, and admins now manage the roles through the API.

* [\~] Password recovery. The reset email is requested (`/auth/forgot-password`) and Supabase sends it. The backend has no reset-completion endpoint; the reset page uses Supabase directly.
* [\~] Session management. Logout works. No refresh endpoint, and no list or revoke of other sessions.

* [ ]  Change password
* [X]  Update personal information. `PATCH /users/me`, including language, timezone and theme.
* [X]  Manage notification preferences. The switches are saved and now respected: they decide which notifications and emails a person receives.
* [X]  View submitted reviews. `GET /users/me/reviews`.
* [ ]  Manage saved hospitals
* [ ]  Request account deletion. The database already anonymises reviews of deleted accounts, but there is no request endpoint.
* [X]  Login rate limiting and brute-force protection. Only failed logins count toward the limit.
* [ ]  Terms and privacy policy acceptance. Paused, together with age confirmation and onboarding.
* [X]  Registration does not make someone a verified patient. By design: nothing in signup grants any verification.

### 2. Hospital discovery and search

* [X]  Search by hospital name
* [X]  Search by state
* [X]  Search by city
* [X]  Search by LGA
* [ ]  Search by neighbourhood. There is no neighbourhood field, and addresses are not searched.
* [X]  Search by hospital type. `typeId` filter.
* [ ]  Search by available services. Services are shown on a hospital but cannot be searched or filtered yet.

* [\~] Search by rating. Sorting by rating works; a minimum-rating filter does not.

* [ ]  Search by verification status. The status is shown but cannot be filtered on.
* [X]  Filter by ownership
* [ ]  Filter by review count
* [X]  Sort by highest rated. A damped ranking score, so one 5-star review does not outrank a well-reviewed hospital.
* [ ]  Sort by most reviewed
* [X]  Sort by recently added
* [X]  Sort alphabetically
* [X]  Pagination
* [X]  Listing shows rating, review count and verification badge. `rating: { average, count }` and `status`.
* [X]  Extra: near-me search by distance. Not in the PRD list.
* [X]  Extra: typo-tolerant search. "hosptial lagoss" finds Lagos hospitals. Not in the PRD list.

### 3. Hospital profile management

* [X]  Name, description and type. Shown on the profile.
* [ ]  Logo and cover image. Imported images are never shown, and there is no image upload yet.
* [X]  Ownership and year established
* [X]  State, city, LGA, address and coordinates

* [\~] Official phone, email and website. Shown (cleaned from imported data). Representatives cannot edit them yet.

* [X]  Social media links. Typed in by representatives of claimed hospitals only, from six platforms, strictly checked.

* [\~] Emergency, maternity, outpatient, laboratory, imaging, surgery, paediatrics, dental, pharmacy and other services. Shown as a cleaned list from imported data. There is no structured service catalogue yet.
* [\~] Operating hours. Shown from imported data.
* [\~] Available facilities. Shown from imported data, sorted A-Z.

* [X]  Accessibility information

* [\~] HMO acceptance, where verified. Insurance list is shown from imported data; it is not marked as verified.
* [\~] Accreditation, where applicable and verified. Same: shown, not verified.
* [\~] Hospital profile updates. Social links only.

* [ ]  Image uploads
* [ ]  Services and department management
* [ ]  Contact information management
* [X]  Hospital status management. All seven statuses work: unclaimed, claim pending, claimed, verification pending, verified, rejected, suspended.

### 4. Hospital ratings and reviews

* [X]  Submit reviews
* [X]  Overall rating from 1 to 5
* [X]  Category ratings from 1 to 5. All eight PRD categories. Blank categories are allowed and never counted as zero.
* [X]  Review title and written review. Links are refused.
* [X]  Optional visit date. A single date, not a period.
* [X]  Optional department or service visited
* [ ]  Confirmation of genuine personal experience
* [ ]  Acceptance of review guidelines
* [ ]  Optional patient or visit verification status. See module 5.
* [X]  Review moderation before publication. Atomic approve and reject; nobody moderates their own review.

* [\~] Required review statuses. Four exist (pending moderation, published, rejected, removed). The PRD lists nine. Flagged and under-investigation are handled through reports (a published review with open reports), not as review statuses; draft and disputed do not exist.

* [X]  Edit own reviews. An edit goes back to moderation.
* [X]  Delete own reviews
* [X]  Retrieve published reviews

* [\~] Retrieve review history. Your own reviews are listed; there is no edit history.

* [X]  Display reviewer name or permitted pseudonym. Anonymous reviews show "Anonymous".
* [ ]  Display verification label
* [X]  Display hospital representative responses. Shown on the public review once a moderator has approved them.
* [X]  Never expose reviewers' email, phone, medical records or ID. Reviewer emails never appear in any public or moderation review response.

### 5. Review verification

* [ ]  Distinguish unverified reviews from verified-visit reviews
* [ ]  Configurable visit-verification process
* [ ]  Approved evidence methods. The private document storage built for claims can be reused for this.

* [\~] Restrict access to supporting evidence. Built for claim and verification documents (moderators only, every view logged). Not applied to visit evidence yet.
* [\~] Evidence retention and deletion policies. Built for claim and verification documents (30 days after a decision). Not applied to visit evidence yet.
* [\~] Disputed reviews and investigations. Reported reviews are investigated and decided. A reviewer cannot dispute a takedown yet.

* [X]  Email verification does not make someone a verified patient. Respected everywhere.
* [X]  Nobody must upload medical records to review. Nothing like that is asked for.

### 6. Hospital rating calculation engine

* [X]  Calculate hospital overall rating. Arithmetic mean, kept up to date by the database.
* [X]  Calculate category ratings independently. `GET /hospitals/:id/rating-summary`.
* [X]  Count eligible published reviews
* [X]  Update automatically when reviews are published or removed. Database triggers, safe under concurrent changes.
* [X]  Exclude rejected and removed reviews. Only published reviews count.
* [X]  Policy for reviews under investigation. A reported review stays published and counted until a moderator decides; a report alone never hides it. Written down in the README.

* [\~] Exclude duplicate or fraudulent reviews. One review per person per hospital, a daily limit, no links, representatives are blocked, and people can report fake reviews. No automatic fraud detection.

* [X]  Display review counts alongside ratings

### 7. Hospital representatives and claiming

* [X]  Request ownership or management of a hospital. Several people can claim; a moderator decides.
* [X]  Submit verification documents. PDF, JPEG or PNG up to 5 MB, uploaded to a private bucket and checked by the server.

* [\~] Update permitted hospital information. Social links only.

* [ ]  Upload hospital images
* [ ]  Add services and departments
* [X]  Respond publicly to reviews. One response per review, moderator-approved, no links.
* [ ]  View hospital performance analytics
* [X]  Report fraudulent or abusive reviews. Representatives and ordinary users can report, with a reason; representative reports are flagged for moderators.
* [ ]  Manage authorised hospital staff accounts. A hospital has one representative today.
* [X]  Stop representatives manipulating ratings. They cannot review their own hospital, cannot answer their own reviews, have no power to delete or hide any review, and their responses are moderated.

### 8. Administration and moderation

* [X]  Manage user accounts. Admins can search accounts, see activity counts, change roles, suspend and reactivate. They cannot edit another person's profile.

* [\~] Manage hospital listings. Admins can suspend and restore a hospital.

* [X]  Approve or reject hospital verification. With documents required, and every document view logged.
* [ ]  Review submitted feedback
* [X]  Moderate inappropriate content. Review moderation queue.

* [\~] Manage reports and complaints. Reports on reviews are handled. User complaints are not built.

* [X]  Suspend accounts. Takes effect on the person's next request; the reason is recorded and told to them. The last administrator is protected.
* [ ]  Manage platform categories and configuration
* [ ]  View analytics and reports
* [ ]  Platform-wide notifications. The notification system exists; there is no admin tool to send an announcement yet.
* [X]  Review flagged reviews. The report queue lists reported reviews, escalated cases first.
* [X]  Investigate reported content. Mark reports as under investigation; the review stays published meanwhile.
* [X]  Approve or reject reviews
* [X]  Escalate cases to administrators. An escalated case can only be decided by an admin.
* [ ]  Handle user complaints
* [X]  Communicate moderation decisions. Claim, verification and review decisions are sent to the person, in the app and by email, with the moderator's reason when something is rejected.

* [\~] Moderators must not have unrestricted access to sensitive information. Reviewer emails are hidden, document views are logged, and moderators cannot use any account-management tool. Moderators do see the email of a person who made a claim, so they can contact them.

### 9. Other user-role capabilities

* [ ]  Favourite hospital management
* [X]  User review history
* [X]  Notifications. In-app list with unread count, plus emails through SMTP, for claims, verification, suspension and review moderation. Push notifications are not built. Emails need your domain and mailbox before they leave the server.
* [ ]  Privacy preferences. The database column exists; no endpoint uses it.
* [ ]  Hospital performance analytics
* [X]  Hospital representative responses
* [ ]  Hospital staff account management
* [X]  Representative review reports

* [\~] User complaints and moderation decisions. Moderation decisions are recorded in an append-only history and told to the people affected. Complaints are not built.

## Suggested next steps

1. **Go live with email:** buy the domain, create the mailbox, add the DNS records, fill in the SMTP settings and run `npm run test:email` (the README has the checklist). Then make your first administrator with `npm run make:admin`.
2. **Visit verification** (module 5), reusing the private document storage.
3. **Moderator tooling:** notify moderators when new claims, reports and responses arrive, and let people appeal a review takedown or an account suspension.
4. **Hospital profile tools** (module 3 and 7): image uploads, services and departments, editing contact details.
5. **Smaller gaps in search and accounts:** service filter, status filter, most-reviewed sort, change password, saved hospitals, account deletion, user complaints.

# Dreel backend: achievement list

Last updated: 25 November 2026.

How to read it: `[x]` done, `[~]` partly done (the note says what is missing), `[ ]` not started. The items come from the PRD checklist, in the PRD's module order. "Done" means built AND tested against a real PostgreSQL database in the test environment. Three things were never tested end to end: your real Supabase connection through Prisma 6's engine, the calls to Supabase Storage, and sending through a real email provider and domain.

## Summary


| Module                                   |   Done | Partly | Not started |   Total |
| ---------------------------------------- | -----: | -----: | ----------: | ------: |
| 1. User accounts and authentication      |     10 |      2 |           4 |      16 |
| 2. Hospital discovery and search         |     13 |      1 |           5 |      19 |
| 3. Hospital profile management           |      6 |      7 |           4 |      17 |
| 4. Hospital ratings and reviews          |     13 |      2 |           4 |      19 |
| 5. Review verification                   |      2 |      3 |           3 |       8 |
| 6. Hospital rating calculation engine    |      7 |      1 |           0 |       8 |
| 7. Hospital representatives and claiming |      5 |      1 |           4 |      10 |
| 8. Administration and moderation         |      7 |      3 |           7 |      17 |
| 9. Other user-role capabilities          |      4 |      1 |           4 |       9 |
| **All modules**                          | **67** | **21** |      **35** | **123** |

About 54% of the checklist items are done and another 17% are partly done (the count includes two extras that are not in the PRD). The biggest gaps are role management (task 7), visit verification, user complaints, and anything involving images.

## Task list (the roadmap)


| #   | Task                                                                                          | Status                                                       |
| --- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1   | API rate limiting                                                                             | Delivered                                                    |
| 2   | Request validation and sanitisation                                                           | Delivered                                                    |
| 3   | Centralised error handling                                                                    | Delivered                                                    |
| 4   | Security hardening: Helmet, CORS, token handling, audit logging, enumeration protection       | Delivered                                                    |
| 5   | User profile and preferences (notifications, language, timezone, theme)                       | Delivered                                                    |
| 6a  | Hospital directory: search, filters, sorting, near-me, details                                | Delivered                                                    |
| 6b  | Reviews, ratings and moderation                                                               | Delivered                                                    |
| 6c  | Claims, verification, representatives, social links, suspension, proof documents              | Delivered                                                    |
| 6c+ | Notifications: in-app list and queued emails through SMTP                                     | Delivered (needs your domain and mailbox to send real email) |
| 6d  | Reports, hospital responses to reviews, moderation history                                    | Delivered                                                    |
| 7   | Role management: admin-only role changes, and a guard that stops the last admin being changed | Not started                                                  |
| -   | Manual: raise the minimum password length to 8 in the Supabase dashboard                      | Needs doing by you                                           |

### Also delivered, beyond the original list

* Approved hospital response shape (nested `location`, `contact`, `info`; camelCase; arrays kept as arrays).
* Switch from Prisma 7 to Prisma 6.12.0, removing the `pg` adapter.
* Typo-tolerant search with `search.matchType` and `sort=relevance`.
* A conflict-of-interest rule: representatives and pending claimants cannot review their own hospital.
* Document upload with server-side file checks, moderator-only 5-minute links with a fail-closed audit record, 30-day retention and a purge job.
* Notifications and email: queue, retries, templates, settings respected, a log-only mode, and `npm run test:email` for when the domain exists.
* Reports on reviews, hospital responses to reviews and an append-only moderation history (task 6d), including the policy that a report alone never hides a review.
* A deadlock found and fixed when two moderators approve rival claims at once.
* Swagger documentation for every route.

## Detail by PRD module

### 1. User accounts and authentication

* [X]  Email/password registration. Same response for new and existing emails, so nobody can probe which emails are registered.
* [X]  Email verification. Supabase confirmation email. Reviews and claims need a confirmed email.
* [X]  Login. With login-activity records.
* [X]  Access-token authentication
* [X]  Role-based access control foundation. USER, moderator and admin roles; routes are guarded per role.

* [\~] Password recovery. The reset email is requested (`/auth/forgot-password`) and Supabase sends it. The backend has no reset-completion endpoint; the reset page uses Supabase directly.
* [\~] Session management. Logout works. No refresh endpoint, and no list or revoke of other sessions.

* [ ]  Change password
* [X]  Update personal information. `PATCH /users/me`, including language, timezone and theme.
* [X]  Manage notification preferences. The switches are saved and now respected: they decide which notifications and emails a person receives.
* [X]  View submitted reviews. `GET /users/me/reviews`.
* [ ]  Manage saved hospitals
* [ ]  Request account deletion. The database already anonymises reviews of deleted accounts, but there is no request endpoint.
* [X]  Login rate limiting and brute-force protection. Only failed logins count toward the limit.
* [ ]  Terms and privacy policy acceptance. Paused, together with age confirmation and onboarding.
* [X]  Registration does not make someone a verified patient. By design: nothing in signup grants any verification.

### 2. Hospital discovery and search

* [X]  Search by hospital name
* [X]  Search by state
* [X]  Search by city
* [X]  Search by LGA
* [ ]  Search by neighbourhood. There is no neighbourhood field, and addresses are not searched.
* [X]  Search by hospital type. `typeId` filter.
* [ ]  Search by available services. Services are shown on a hospital but cannot be searched or filtered yet.

* [\~] Search by rating. Sorting by rating works; a minimum-rating filter does not.

* [ ]  Search by verification status. The status is shown but cannot be filtered on.
* [X]  Filter by ownership
* [ ]  Filter by review count
* [X]  Sort by highest rated. A damped ranking score, so one 5-star review does not outrank a well-reviewed hospital.
* [ ]  Sort by most reviewed
* [X]  Sort by recently added
* [X]  Sort alphabetically
* [X]  Pagination
* [X]  Listing shows rating, review count and verification badge. `rating: { average, count }` and `status`.
* [X]  Extra: near-me search by distance. Not in the PRD list.
* [X]  Extra: typo-tolerant search. "hosptial lagoss" finds Lagos hospitals. Not in the PRD list.

### 3. Hospital profile management

* [X]  Name, description and type. Shown on the profile.
* [ ]  Logo and cover image. Imported images are never shown, and there is no image upload yet.
* [X]  Ownership and year established
* [X]  State, city, LGA, address and coordinates

* [\~] Official phone, email and website. Shown (cleaned from imported data). Representatives cannot edit them yet.

* [X]  Social media links. Typed in by representatives of claimed hospitals only, from six platforms, strictly checked.

* [\~] Emergency, maternity, outpatient, laboratory, imaging, surgery, paediatrics, dental, pharmacy and other services. Shown as a cleaned list from imported data. There is no structured service catalogue yet.
* [\~] Operating hours. Shown from imported data.
* [\~] Available facilities. Shown from imported data, sorted A-Z.

* [X]  Accessibility information

* [\~] HMO acceptance, where verified. Insurance list is shown from imported data; it is not marked as verified.
* [\~] Accreditation, where applicable and verified. Same: shown, not verified.
* [\~] Hospital profile updates. Social links only.

* [ ]  Image uploads
* [ ]  Services and department management
* [ ]  Contact information management
* [X]  Hospital status management. All seven statuses work: unclaimed, claim pending, claimed, verification pending, verified, rejected, suspended.

### 4. Hospital ratings and reviews

* [X]  Submit reviews
* [X]  Overall rating from 1 to 5
* [X]  Category ratings from 1 to 5. All eight PRD categories. Blank categories are allowed and never counted as zero.
* [X]  Review title and written review. Links are refused.
* [X]  Optional visit date. A single date, not a period.
* [X]  Optional department or service visited
* [ ]  Confirmation of genuine personal experience
* [ ]  Acceptance of review guidelines
* [ ]  Optional patient or visit verification status. See module 5.
* [X]  Review moderation before publication. Atomic approve and reject; nobody moderates their own review.

* [\~] Required review statuses. Four exist (pending moderation, published, rejected, removed). The PRD lists nine. Flagged and under-investigation are handled through reports (a published review with open reports), not as review statuses; draft and disputed do not exist.

* [X]  Edit own reviews. An edit goes back to moderation.
* [X]  Delete own reviews
* [X]  Retrieve published reviews

* [\~] Retrieve review history. Your own reviews are listed; there is no edit history.

* [X]  Display reviewer name or permitted pseudonym. Anonymous reviews show "Anonymous".
* [ ]  Display verification label
* [X]  Display hospital representative responses. Shown on the public review once a moderator has approved them.
* [X]  Never expose reviewers' email, phone, medical records or ID. Reviewer emails never appear in any public or moderation review response.

### 5. Review verification

* [ ]  Distinguish unverified reviews from verified-visit reviews
* [ ]  Configurable visit-verification process
* [ ]  Approved evidence methods. The private document storage built for claims can be reused for this.

* [\~] Restrict access to supporting evidence. Built for claim and verification documents (moderators only, every view logged). Not applied to visit evidence yet.
* [\~] Evidence retention and deletion policies. Built for claim and verification documents (30 days after a decision). Not applied to visit evidence yet.
* [\~] Disputed reviews and investigations. Reported reviews are investigated and decided. A reviewer cannot dispute a takedown yet.

* [X]  Email verification does not make someone a verified patient. Respected everywhere.
* [X]  Nobody must upload medical records to review. Nothing like that is asked for.

### 6. Hospital rating calculation engine

* [X]  Calculate hospital overall rating. Arithmetic mean, kept up to date by the database.
* [X]  Calculate category ratings independently. `GET /hospitals/:id/rating-summary`.
* [X]  Count eligible published reviews
* [X]  Update automatically when reviews are published or removed. Database triggers, safe under concurrent changes.
* [X]  Exclude rejected and removed reviews. Only published reviews count.
* [X]  Policy for reviews under investigation. A reported review stays published and counted until a moderator decides; a report alone never hides it. Written down in the README.

* [\~] Exclude duplicate or fraudulent reviews. One review per person per hospital, a daily limit, no links, representatives are blocked, and people can report fake reviews. No automatic fraud detection.

* [X]  Display review counts alongside ratings

### 7. Hospital representatives and claiming

* [X]  Request ownership or management of a hospital. Several people can claim; a moderator decides.
* [X]  Submit verification documents. PDF, JPEG or PNG up to 5 MB, uploaded to a private bucket and checked by the server.

* [\~] Update permitted hospital information. Social links only.

* [ ]  Upload hospital images
* [ ]  Add services and departments
* [X]  Respond publicly to reviews. One response per review, moderator-approved, no links.
* [ ]  View hospital performance analytics
* [X]  Report fraudulent or abusive reviews. Representatives and ordinary users can report, with a reason; representative reports are flagged for moderators.
* [ ]  Manage authorised hospital staff accounts. A hospital has one representative today.
* [X]  Stop representatives manipulating ratings. They cannot review their own hospital, cannot answer their own reviews, have no power to delete or hide any review, and their responses are moderated.

### 8. Administration and moderation

* [ ]  Manage user accounts. Task 7.

* [\~] Manage hospital listings. Admins can suspend and restore a hospital.

* [X]  Approve or reject hospital verification. With documents required, and every document view logged.
* [ ]  Review submitted feedback
* [X]  Moderate inappropriate content. Review moderation queue.

* [\~] Manage reports and complaints. Reports on reviews are handled. User complaints are not built.

* [ ]  Suspend accounts. Task 7.
* [ ]  Manage platform categories and configuration
* [ ]  View analytics and reports
* [ ]  Platform-wide notifications. The notification system exists; there is no admin tool to send an announcement yet.
* [X]  Review flagged reviews. The report queue lists reported reviews, escalated cases first.
* [X]  Investigate reported content. Mark reports as under investigation; the review stays published meanwhile.
* [X]  Approve or reject reviews
* [X]  Escalate cases to administrators. An escalated case can only be decided by an admin.
* [ ]  Handle user complaints
* [X]  Communicate moderation decisions. Claim, verification and review decisions are sent to the person, in the app and by email, with the moderator's reason when something is rejected.

* [\~] Moderators must not have unrestricted access to sensitive information. Reviewer emails are hidden and document views are logged. Moderators do see the email of a person who made a claim, so they can contact them.

### 9. Other user-role capabilities

* [ ]  Favourite hospital management
* [X]  User review history
* [X]  Notifications. In-app list with unread count, plus emails through SMTP, for claims, verification, suspension and review moderation. Push notifications are not built. Emails need your domain and mailbox before they leave the server.
* [ ]  Privacy preferences. The database column exists; no endpoint uses it.
* [ ]  Hospital performance analytics
* [X]  Hospital representative responses
* [ ]  Hospital staff account management
* [X]  Representative review reports

* [\~] User complaints and moderation decisions. Moderation decisions are recorded in an append-only history and told to the people affected. Complaints are not built.

## Suggested next steps

1. **Task 7:** role management: admin-only role changes, a guard so the last admin cannot be removed, and a safe way to make moderators without SQL. It also unlocks "manage user accounts" and "suspend accounts".
2. **Go live with email:** buy the domain, create the mailbox, add the DNS records, fill in the SMTP settings and run `npm run test:email` (the README has the checklist).
3. **Visit verification** (module 5), reusing the private document storage.
4. **Moderator tooling:** notify moderators when new claims, reports and responses arrive, and let a reviewer appeal a takedown.
5. **Smaller gaps in search and accounts:** service filter, status filter, most-reviewed sort, change password, saved hospitals, account deletion.

Last updated: 24 November 2026.

How to read it: `[x]` done, `[~]` partly done (the note says what is missing), `[ ]` not started. The items come from the PRD checklist, in the PRD's module order. "Done" means built AND tested against a real PostgreSQL database in the test environment. Three things were never tested end to end: your real Supabase connection through Prisma 6's engine, the calls to Supabase Storage, and sending through a real email provider and domain.

## Summary


| Module                                   |   Done | Partly | Not started |   Total |
| ---------------------------------------- | -----: | -----: | ----------: | ------: |
| 1. User accounts and authentication      |     10 |      2 |           4 |      16 |
| 2. Hospital discovery and search         |     13 |      1 |           5 |      19 |
| 3. Hospital profile management           |      6 |      7 |           4 |      17 |
| 4. Hospital ratings and reviews          |     12 |      2 |           5 |      19 |
| 5. Review verification                   |      2 |      2 |           4 |       8 |
| 6. Hospital rating calculation engine    |      6 |      1 |           1 |       8 |
| 7. Hospital representatives and claiming |      2 |      2 |           6 |      10 |
| 8. Administration and moderation         |      4 |      2 |          11 |      17 |
| 9. Other user-role capabilities          |      2 |      0 |           7 |       9 |
| **All modules**                          | **57** | **19** |      **47** | **123** |

About 46% of the checklist items are done and another 15% are partly done (the count includes two extras that are not in the PRD). The biggest gaps are hospital responses to reviews, reports and flagging, visit verification, and anything involving images.

## Task list (the roadmap)


| #   | Task                                                                                          | Status                                                       |
| --- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1   | API rate limiting                                                                             | Delivered                                                    |
| 2   | Request validation and sanitisation                                                           | Delivered                                                    |
| 3   | Centralised error handling                                                                    | Delivered                                                    |
| 4   | Security hardening: Helmet, CORS, token handling, audit logging, enumeration protection       | Delivered                                                    |
| 5   | User profile and preferences (notifications, language, timezone, theme)                       | Delivered                                                    |
| 6a  | Hospital directory: search, filters, sorting, near-me, details                                | Delivered                                                    |
| 6b  | Reviews, ratings and moderation                                                               | Delivered                                                    |
| 6c  | Claims, verification, representatives, social links, suspension, proof documents              | Delivered                                                    |
| 6c+ | Notifications: in-app list and queued emails through SMTP                                     | Delivered (needs your domain and mailbox to send real email) |
| 6d  | Reports, hospital responses to reviews, moderation history                                    | Not started                                                  |
| 7   | Role management: admin-only role changes, and a guard that stops the last admin being changed | Not started                                                  |
| -   | Manual: raise the minimum password length to 8 in the Supabase dashboard                      | Needs doing by you                                           |

### Also delivered, beyond the original list

- Approved hospital response shape (nested `location`, `contact`, `info`; camelCase; arrays kept as arrays).
- Switch from Prisma 7 to Prisma 6.12.0, removing the `pg` adapter.
- Typo-tolerant search with `search.matchType` and `sort=relevance`.
- A conflict-of-interest rule: representatives and pending claimants cannot review their own hospital.
- Document upload with server-side file checks, moderator-only 5-minute links with a fail-closed audit record, 30-day retention and a purge job.
- Notifications and email: queue, retries, templates, settings respected, a log-only mode, and `npm run test:email` for when the domain exists.
- A deadlock found and fixed when two moderators approve rival claims at once.
- Swagger documentation for every route.

## Detail by PRD module

### 1. User accounts and authentication

- [X]  Email/password registration. Same response for new and existing emails, so nobody can probe which emails are registered.
- [X]  Email verification. Supabase confirmation email. Reviews and claims need a confirmed email.
- [X]  Login. With login-activity records.
- [X]  Access-token authentication
- [X]  Role-based access control foundation. USER, moderator and admin roles; routes are guarded per role.

- [~] Password recovery. The reset email is requested (`/auth/forgot-password`) and Supabase sends it. The backend has no reset-completion endpoint; the reset page uses Supabase directly.
- [~] Session management. Logout works. No refresh endpoint, and no list or revoke of other sessions.

- [ ]  Change password
- [X]  Update personal information. `PATCH /users/me`, including language, timezone and theme.
- [X]  Manage notification preferences. The switches are saved and now respected: they decide which notifications and emails a person receives.
- [X]  View submitted reviews. `GET /users/me/reviews`.
- [ ]  Manage saved hospitals
- [ ]  Request account deletion. The database already anonymises reviews of deleted accounts, but there is no request endpoint.
- [X]  Login rate limiting and brute-force protection. Only failed logins count toward the limit.
- [ ]  Terms and privacy policy acceptance. Paused, together with age confirmation and onboarding.
- [X]  Registration does not make someone a verified patient. By design: nothing in signup grants any verification.

### 2. Hospital discovery and search

- [X]  Search by hospital name
- [X]  Search by state
- [X]  Search by city
- [X]  Search by LGA
- [ ]  Search by neighbourhood. There is no neighbourhood field, and addresses are not searched.
- [X]  Search by hospital type. `typeId` filter.
- [ ]  Search by available services. Services are shown on a hospital but cannot be searched or filtered yet.

- [~] Search by rating. Sorting by rating works; a minimum-rating filter does not.

- [ ]  Search by verification status. The status is shown but cannot be filtered on.
- [X]  Filter by ownership
- [ ]  Filter by review count
- [X]  Sort by highest rated. A damped ranking score, so one 5-star review does not outrank a well-reviewed hospital.
- [ ]  Sort by most reviewed
- [X]  Sort by recently added
- [X]  Sort alphabetically
- [X]  Pagination
- [X]  Listing shows rating, review count and verification badge. `rating: { average, count }` and `status`.
- [X]  Extra: near-me search by distance. Not in the PRD list.
- [X]  Extra: typo-tolerant search. "hosptial lagoss" finds Lagos hospitals. Not in the PRD list.

### 3. Hospital profile management

- [X]  Name, description and type. Shown on the profile.
- [ ]  Logo and cover image. Imported images are never shown, and there is no image upload yet.
- [X]  Ownership and year established
- [X]  State, city, LGA, address and coordinates

- [~] Official phone, email and website. Shown (cleaned from imported data). Representatives cannot edit them yet.

- [X]  Social media links. Typed in by representatives of claimed hospitals only, from six platforms, strictly checked.

- [~] Emergency, maternity, outpatient, laboratory, imaging, surgery, paediatrics, dental, pharmacy and other services. Shown as a cleaned list from imported data. There is no structured service catalogue yet.
- [~] Operating hours. Shown from imported data.
- [~] Available facilities. Shown from imported data, sorted A-Z.

- [X]  Accessibility information

- [~] HMO acceptance, where verified. Insurance list is shown from imported data; it is not marked as verified.
- [~] Accreditation, where applicable and verified. Same: shown, not verified.
- [~] Hospital profile updates. Social links only.

- [ ]  Image uploads
- [ ]  Services and department management
- [ ]  Contact information management
- [X]  Hospital status management. All seven statuses work: unclaimed, claim pending, claimed, verification pending, verified, rejected, suspended.

### 4. Hospital ratings and reviews

- [X]  Submit reviews
- [X]  Overall rating from 1 to 5
- [X]  Category ratings from 1 to 5. All eight PRD categories. Blank categories are allowed and never counted as zero.
- [X]  Review title and written review. Links are refused.
- [X]  Optional visit date. A single date, not a period.
- [X]  Optional department or service visited
- [ ]  Confirmation of genuine personal experience
- [ ]  Acceptance of review guidelines
- [ ]  Optional patient or visit verification status. See module 5.
- [X]  Review moderation before publication. Atomic approve and reject; nobody moderates their own review.

- [~] Required review statuses. Four exist (pending moderation, published, rejected, removed). The PRD lists nine, including draft, flagged, under investigation and disputed.

- [X]  Edit own reviews. An edit goes back to moderation.
- [X]  Delete own reviews
- [X]  Retrieve published reviews

- [~] Retrieve review history. Your own reviews are listed; there is no edit history.

- [X]  Display reviewer name or permitted pseudonym. Anonymous reviews show "Anonymous".
- [ ]  Display verification label
- [ ]  Display hospital representative responses. Task 6d.
- [X]  Never expose reviewers' email, phone, medical records or ID. Reviewer emails never appear in any public or moderation review response.

### 5. Review verification

- [ ]  Distinguish unverified reviews from verified-visit reviews
- [ ]  Configurable visit-verification process
- [ ]  Approved evidence methods. The private document storage built for claims can be reused for this.

- [~] Restrict access to supporting evidence. Built for claim and verification documents (moderators only, every view logged). Not applied to visit evidence yet.
- [~] Evidence retention and deletion policies. Built for claim and verification documents (30 days after a decision). Not applied to visit evidence yet.

- [ ]  Disputed reviews and investigations
- [X]  Email verification does not make someone a verified patient. Respected everywhere.
- [X]  Nobody must upload medical records to review. Nothing like that is asked for.

### 6. Hospital rating calculation engine

- [X]  Calculate hospital overall rating. Arithmetic mean, kept up to date by the database.
- [X]  Calculate category ratings independently. `GET /hospitals/:id/rating-summary`.
- [X]  Count eligible published reviews
- [X]  Update automatically when reviews are published or removed. Database triggers, safe under concurrent changes.
- [X]  Exclude rejected and removed reviews. Only published reviews count.
- [ ]  Policy for reviews under investigation. There is no investigation status yet.

- [~] Exclude duplicate or fraudulent reviews. One review per person per hospital, a daily limit, no links, and representatives are blocked. No fraud detection beyond that.

- [X]  Display review counts alongside ratings

### 7. Hospital representatives and claiming

- [X]  Request ownership or management of a hospital. Several people can claim; a moderator decides.
- [X]  Submit verification documents. PDF, JPEG or PNG up to 5 MB, uploaded to a private bucket and checked by the server.

- [~] Update permitted hospital information. Social links only.

- [ ]  Upload hospital images
- [ ]  Add services and departments
- [ ]  Respond publicly to reviews. Task 6d.
- [ ]  View hospital performance analytics
- [ ]  Report fraudulent or abusive reviews. Task 6d.
- [ ]  Manage authorised hospital staff accounts. A hospital has one representative today.

- [~] Stop representatives manipulating ratings. They cannot review their own hospital (including editing an old review), and have no power to delete reviews.

### 8. Administration and moderation

- [ ]  Manage user accounts. Task 7.

- [~] Manage hospital listings. Admins can suspend and restore a hospital.

- [X]  Approve or reject hospital verification. With documents required, and every document view logged.
- [ ]  Review submitted feedback
- [X]  Moderate inappropriate content. Review moderation queue.
- [ ]  Manage reports and complaints. Task 6d.
- [ ]  Suspend accounts. Task 7.
- [ ]  Manage platform categories and configuration
- [ ]  View analytics and reports
- [ ]  Platform-wide notifications. The notification system exists; there is no admin tool to send an announcement yet.
- [ ]  Review flagged reviews. Reviews cannot be flagged yet (task 6d).
- [ ]  Investigate reported content
- [X]  Approve or reject reviews
- [ ]  Escalate cases to administrators
- [ ]  Handle user complaints
- [X]  Communicate moderation decisions. Claim, verification and review decisions are sent to the person, in the app and by email, with the moderator's reason when something is rejected.

- [~] Moderators must not have unrestricted access to sensitive information. Reviewer emails are hidden and document views are logged. Moderators do see the email of a person who made a claim, so they can contact them.

### 9. Other user-role capabilities

- [ ]  Favourite hospital management
- [X]  User review history
- [X]  Notifications. In-app list with unread count, plus emails through SMTP, for claims, verification, suspension and review moderation. Push notifications are not built. Emails need your domain and mailbox before they leave the server.
- [ ]  Privacy preferences. The database column exists; no endpoint uses it.
- [ ]  Hospital performance analytics
- [ ]  Hospital representative responses. Task 6d.
- [ ]  Hospital staff account management
- [ ]  Representative review reports. Task 6d.
- [ ]  User complaints and moderation decisions

## Suggested next steps

1. **Task 6d:** reports and flagging, hospital responses to reviews, moderation history. It unlocks several items in modules 4, 7, 8 and 9, and the notification system is ready for the response and report events.
2. **Task 7:** role management, which also gives you a safe way to make moderators without SQL.
3. **Go live with email:** buy the domain, create the mailbox, add the DNS records, fill in the SMTP settings and run `npm run test:email` (the README has the checklist).
4. **Visit verification** (module 5), reusing the private document storage.
5. **Smaller gaps in search and accounts:** service filter, status filter, most-reviewed sort, change password, saved hospitals, account deletion.
