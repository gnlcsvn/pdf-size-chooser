> **✅ ARCHIVED - IMPLEMENTATION COMPLETE**
>
> This plan was fully implemented on January 29, 2026.
> All features are now live in the main branch.
>
> **Completion Status:**
> - Phase 1 (Core Flow): ✅ Issues #1, #2, #7, #8, #10, #11
> - Phase 2 (Precision): ✅ Issues #3, #4
> - Phase 3 (Edge Cases): ✅ Issues #5, #9
> - Issue #6 (Split PDF): Intentionally removed after review
>
> This document is preserved for historical reference.

---

# PDF Size Chooser - Implementation Plan

## Executive Summary

We are building the **most accurate PDF compression tool** focused on one core promise: **hit the target file size, guaranteed.**

The problem we solve: Users need to send large PDFs via email but have no reliable way to compress them to fit attachment limits. Existing tools give inaccurate estimates (e.g., "24.3MB" but the download is 25.2MB), forcing users through frustrating trial-and-error.

**Our differentiator:** Precision. If a user says "25MB for Gmail," they get a file ≤25MB. Every time.

---

## Core Philosophy

1. **Users don't want to become compression experts** - They want to send an email and move on with their day
2. **Reliability over features** - If we hit the target, that's the whole product
3. **Meet users where they are** - They think in destinations ("Gmail"), not megabytes
4. **Never overpromise** - Always deliver under the target, never over

---

## User Journey

### The Problem State
A user has a 45MB PDF with graphs and images. They need to email it via Gmail (25MB limit). They try a random online compressor, wait for processing, download the result... it's 26.1MB. They try again with "higher compression," now it's 18MB but the images are unreadable. They're frustrated and running late.

### Our Solution State
User uploads to our tool, selects "Gmail (25MB)," we analyze and confirm "We can do this." They click compress, get a 24.1MB file. Done. They send their email and get on with their day. They never think about compression settings because they didn't have to.

---

## User Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         UPLOAD                                   │
│                    [Drop PDF here]                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       ANALYZING                                  │
│                                                                  │
│   "Scanning 47 pages..."                                        │
│   "Analyzing 12 embedded images..."                             │
│   "Calculating compression options..."                          │
│                                                                  │
│   Progress: ████████████░░░░░░░░ 60%                            │
│                                                                  │
│   Found: 47 pages · 12 images · 3.2MB compressible content      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   TARGET SELECTION                               │
│                                                                  │
│   "Where are you sending this?"                                 │
│                                                                  │
│   EMAIL                                                          │
│   [Gmail 25MB] [Outlook 20MB] [Yahoo 25MB] [iCloud 20MB]        │
│   [ProtonMail 25MB]                                             │
│                                                                  │
│   CHAT                                                           │
│   [Slack 25MB] [Discord 25MB] [WhatsApp 100MB] [Messenger 25MB] │
│   [LinkedIn 20MB]                                                │
│                                                                  │
│   CUSTOM                                                         │
│   [ _______ ] MB                                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ Can we hit it?  │
                    └─────────────────┘
                      │           │
                     YES          NO
                      │           │
                      ▼           ▼
┌──────────────────────────┐  ┌─────────────────────────────────────┐
│     CONFIRMATION         │  │        IMPOSSIBLE TARGET            │
│                          │  │                                     │
│  ✓ "We can do this."     │  │  ⚠ "Your PDF can't be compressed   │
│                          │  │     below ~32MB without severe      │
│  Estimated: 23.8 MB      │  │     quality loss."                  │
│                          │  │                                     │
│  [Compress]              │  │  How would you like to proceed?     │
│                          │  │                                     │
└──────────────────────────┘  │  ( ) Split into 2 files             │
                              │      (Part 1: ~24MB, Part 2: ~24MB) │
                              │                                     │
                              │  ( ) Compress anyway                │
                              │      (expect unreadable images)     │
                              │                                     │
                              │  ( ) Try a different target         │
                              │      [ _______ ] MB                 │
                              │                                     │
                              │  [Continue]                         │
                              └─────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      COMPRESSING                                 │
│                                                                  │
│   "Compressing your PDF..."                                     │
│                                                                  │
│   Progress: ████████████████░░░░ 80%                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        SUCCESS                                   │
│                                                                  │
│   ✓ Done. 24.1 MB - fits in Gmail with room to spare.          │
│                                                                  │
│   [Download]  [Compress another]                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Feature Specifications

### Feature 1: PDF Analysis Engine

**Purpose:** Understand the PDF structure to make accurate compression predictions.

**Requirements:**
- Decompose PDF into components: images, vector graphics, text, fonts, metadata
- Identify what is compressible vs. fixed overhead
- Calculate the "compression budget" - how much can actually shrink
- Must complete in <10 seconds for typical files (under 100 pages)

**User-facing output during analysis:**
- Page count
- Number of embedded images
- Amount of compressible content (in MB)

**Why this matters:** Generic compressors estimate before analyzing. We analyze deeply to estimate accurately.

---

### Feature 2: Platform Presets

**Purpose:** Users think in destinations, not megabytes. Meet them where they are.

**Implementation:** Show platforms grouped by category, even if limits are the same.

| Platform | Limit | Category |
|----------|-------|----------|
| Gmail | 25 MB | Email |
| Outlook.com | 20 MB | Email |
| Outlook Desktop | 20 MB | Email |
| Yahoo Mail | 25 MB | Email |
| iCloud Mail | 20 MB | Email |
| ProtonMail | 25 MB | Email |
| Slack | 25 MB | Chat |
| Discord | 25 MB | Chat |
| WhatsApp | 100 MB | Chat |
| Facebook Messenger | 25 MB | Chat |
| LinkedIn | 20 MB | Chat |
| Telegram | 2 GB | Chat |
| Custom | User input | Custom |

**UI Grouping:**
```
EMAIL
Gmail (25MB) · Outlook (20MB) · Yahoo (25MB) · iCloud (20MB) · ProtonMail (25MB)

CHAT
Slack (25MB) · Discord (25MB) · WhatsApp (100MB) · Messenger (25MB) · LinkedIn (20MB)

CUSTOM
[____] MB
```

**Why this matters:** A user sending via Outlook shouldn't have to know it's 20MB. They click "Outlook" and we handle it.

---

### Feature 3: Accurate Size Estimation

**Purpose:** The core differentiator. Estimate must match reality.

**Technical approach:**
1. Analyze PDF structure to identify all compressible elements
2. For images: sample-compress representative images at different quality levels to build a compression curve specific to this file
3. Account for PDF overhead, metadata, font subsetting
4. **Always estimate conservatively** - if unsure, estimate higher
5. Present estimate as a single number (internally, allow ±2% variance)

**Why this matters:** Other tools fail here. They estimate 24.3MB and deliver 25.2MB. We cannot do this.

---

### Feature 4: Size Verification Gate

**Purpose:** Guarantee we never deliver a file over the target size.

**Implementation:**
```
[Compression completes]
        │
        ▼
[Measure actual file size]
        │
        ▼
    Over target? ───Yes───► [Auto-recompress with tighter settings]
        │                            │
        No                           ▼
        │                   [Measure again]
        │                            │
        ▼                   (loop until under target)
[Show result to user]
```

**Critical rule:** The user NEVER sees a file that exceeds their target. If we compress and it's 25.1MB when they asked for 25MB, we automatically recompress before showing them the result.

**Edge case:** If we cannot get under target even with maximum compression, this should have been caught in the "impossible target" flow. If it somehow wasn't, show an error and offer the split/different target options.

**Why this matters:** This is the entire brand promise. One miss destroys trust.

---

### Feature 5: Impossible Target Handling

**Purpose:** Gracefully handle cases where the requested size cannot be achieved with acceptable quality.

**Detection:** During analysis, calculate the minimum achievable file size with maximum compression. If target < minimum, trigger this flow.

**Three options to present:**

#### Option A: Split into Multiple Files
- Calculate optimal split point to balance file sizes
- Default to automatic splitting ("Let us split it optimally")
- Allow user to specify a page number ("I'll choose: Page ___")
- Show preview: "Part 1 = Pages 1-23 (~24MB) | Part 2 = Pages 24-47 (~22MB)"

#### Option B: Compress Anyway
- Warn clearly: "expect unreadable images" or "severe quality loss"
- Let user proceed if they want to see for themselves
- Still apply the verification gate (deliver ≤ target)

#### Option C: Try Different Target
- Suggest the minimum achievable size
- Let user input a new target
- Re-evaluate feasibility

**UI:**
```
⚠ "Your PDF can't be compressed below ~32MB without severe quality loss."

How would you like to proceed?

( ) Split into 2 files (Part 1: ~24MB, Part 2: ~24MB)
    └─ ( ) Let us split it optimally
       ( ) I'll choose the page: [____]

( ) Compress anyway (expect unreadable images)

( ) Try a different target: [____] MB

[Continue]
```

**Why this matters:** Users need agency. Some will accept quality loss, some want to split, some will find another way. Don't trap them.

---

### Feature 6: Split PDF Functionality

**Purpose:** When a PDF can't fit the target as one file, split it into multiple files that each fit.

**Automatic split logic:**
1. Calculate how many parts needed to fit target (with buffer)
2. Distribute pages to balance file sizes (not just page count - a page with many images weighs more)
3. If PDF has chapter markers/bookmarks, prefer splitting at natural boundaries

**Manual split logic:**
1. User specifies page number
2. Show resulting file size estimates for each part
3. Warn if a part still won't fit target

**Output:**
- Multiple files named: `originalname_part1.pdf`, `originalname_part2.pdf`, etc.
- Clear indication of page ranges in each part

**Why this matters:** "See attached parts 1 and 2" is an acceptable solution for most email scenarios. We make it seamless.

---

### Feature 7: Progress Indication

**Purpose:** Perceived speed matters. Show users what's happening.

**Analysis phase messages (cycle through based on actual progress):**
- "Scanning X pages..."
- "Analyzing X embedded images..."
- "Calculating compression options..."

**Compression phase:**
- "Compressing your PDF..."
- Progress bar showing percentage

**Why this matters:** 8 seconds with visible progress feels faster than 8 seconds with a spinner. Users also trust results more when they see the work happening.

---

### Feature 8: Success Messaging

**Purpose:** Reinforce that we delivered on the promise.

**Format:**
```
✓ Done. [ACTUAL_SIZE] MB - fits in [PLATFORM] with room to spare.

[Download]  [Compress another]
```

**Examples:**
- "✓ Done. 24.1 MB - fits in Gmail with room to spare."
- "✓ Done. 19.2 MB - fits in Outlook with room to spare."

**Why this matters:** "With room to spare" reinforces reliability. User feels confident, not anxious.

---

## Technical Requirements Summary

### Analysis Engine
- Parse PDF structure (pages, images, fonts, metadata)
- Identify and measure compressible vs. non-compressible content
- Sample-compress images to predict compression ratios
- Complete analysis in <10 seconds for files under 100 pages

### Compression Engine
- Support variable quality settings for images
- Preserve text sharpness and vector graphics
- Maintain PDF structure (links, bookmarks, forms if present)
- Target specific file sizes, not just "compression levels"

### Verification System
- Post-compression file size check
- Automatic recompression loop if over target
- Never expose over-target file to user

### Split System
- Calculate optimal split points by file size (not just page count)
- Support user-specified split points
- Generate properly named output files

### Estimation Accuracy Target
- Final file size within ±2% of estimate
- Never exceed target (always under)

---

## States & Edge Cases

| State | Handling |
|-------|----------|
| No file uploaded | Show upload zone |
| Invalid file type | "Please upload a PDF file" |
| Corrupt PDF | "This PDF appears to be damaged. Try a different file." |
| File already under target | "Your file is already under [X]MB! No compression needed." (offer to compress anyway for even smaller) |
| Analysis taking long | Show detailed progress, don't timeout prematurely |
| Compression fails | "Something went wrong. Please try again." + retry button |
| Network error during upload | "Upload failed. Check your connection and try again." |
| Very large file (500MB+) | May need special handling, longer timeouts, chunked processing |

---

## UI Components Needed

1. **UploadZone** - Drag/drop or click to upload (exists)
2. **AnalyzingOverlay** - Progress during analysis (exists)
3. **TargetSelector** - Platform presets + custom input (new)
4. **FeasibilityResult** - Shows "We can do this" or impossible target options (new)
5. **SplitOptions** - UI for choosing split method/page (new)
6. **CompressingOverlay** - Progress during compression (exists)
7. **SuccessResult** - Final size + download button (new)
8. **ErrorState** - Various error messages (new)

---

## Microcopy Guidelines

- **Confidence, not hedging:** "We can do this" not "We think we can do this"
- **Plain language:** "fits in Gmail" not "within attachment size limits"
- **Specific numbers:** "24.1 MB" not "about 24 MB"
- **Action-oriented:** "Download" not "Click here to download your file"
- **Reassurance on success:** "with room to spare" reinforces reliability

---

## Success Metrics

1. **Accuracy:** 100% of delivered files are ≤ target size
2. **Estimation accuracy:** Predicted size within ±2% of actual
3. **Speed:** Analysis <10 seconds, compression <30 seconds for typical files
4. **Completion rate:** Users who upload successfully download a result

---

## Out of Scope (For Now)

- Batch processing multiple separate PDFs
- Account/login system
- API access
- Mobile app
- PDF editing features (merge, reorder pages, etc.)
- Password-protected PDF handling

---

## Implementation Priority

### Phase 1: Core Flow
1. PDF analysis engine (structure parsing, image detection)
2. Target selection UI with platform presets
3. Basic compression with size verification gate
4. Success/download flow

### Phase 2: Precision
1. Sample-based compression estimation
2. Automatic recompression loop
3. Improved estimation accuracy

### Phase 3: Edge Cases
1. Impossible target detection and handling
2. Split PDF functionality
3. Error states and recovery

---

## Execution Order (GitHub Issues)

**Work through issues in this exact order.** Each issue builds on the previous ones.

| Order | Issue | Title | Why This Order |
|-------|-------|-------|----------------|
| 1 | #1 | PDF Analysis Engine | Foundation - everything depends on understanding the PDF |
| 2 | #10 | Core Compression Engine | Need compression working before we can build UI around it |
| 3 | #2 | Target Selection UI | Now we can let users pick a target |
| 4 | #11 | Feasibility Check & Confirmation | Connects analysis → target → compression decision |
| 5 | #7 | Progress Indication UI | Users need feedback during analysis/compression |
| 6 | #8 | Success Result & Download Flow | Complete the happy path end-to-end |
| 7 | #3 | Size Estimation System | Improve accuracy with sample-based estimation |
| 8 | #4 | Size Verification Gate | Add the safety net (auto-recompress loop) |
| 9 | #5 | Impossible Target Detection & Handling | Handle edge case when target can't be hit |
| 10 | #6 | Split PDF Functionality | Enable the "split" option from #5 |
| 11 | #9 | Error States & Edge Case Handling | Polish all error scenarios |

### Checkpoints

After completing issues #1-6, you should have a **working MVP**:
- Upload → Analyze → Select Target → Compress → Download

After completing issues #7-8, you have **precision**:
- Accurate estimates, guaranteed target size

After completing issues #9-11, you have **robustness**:
- Handles all edge cases gracefully

### Notes for Dev Agent

- **Don't skip ahead.** Issue #4 (Verification Gate) needs #10 (Compression) working first.
- **Test the happy path after #6.** Make sure upload-to-download works before adding precision features.
- **Each issue has acceptance criteria.** Check them off before moving to the next issue.
- **Reference this plan** for context on why features exist and how they should behave.

---

## Questions for Dev Agent

1. What PDF library/approach for parsing and compression?
2. Client-side vs. server-side processing? (Privacy vs. performance trade-off)
3. How to handle very large files without browser memory issues?
4. Compression algorithm options for different content types?

---

*Document created: January 2026*
*Purpose: Implementation guide for dev agent*
