---
name: pdf-extract
description: Extract form fields, tables, and images from PDF documents with progressive disclosure of templates and reference docs.
version: 2.1.0
author: anthropic
category: data
verified: true
---

# PDF Extract Skill

When the user uploads a PDF, follow these steps:

1. Call `bash: python scripts/parse.py`
2. If it's a tax form, load `forms.md` for field mappings
3. Otherwise extract using OCR if needed

## Scripts
- scripts/parse.py · main extractor
- scripts/ocr.py · fallback OCR

## Templates
- forms.md · 14 common form types
