// ============================================================
// PrivacyGuard AI - Core Scanner Engine (Browser Extension)
// Pure JavaScript - No dependencies
// ============================================================

const RiskLevel = { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', CRITICAL: 'CRITICAL' };

// ============================================================
// LAYER 1: Rule-Based Detection (Regex + Keyword Patterns)
// ============================================================

const PRIVACY_RULES = [
  // --- PII: Names ---
  {
    name: 'Full Name Pattern',
    pattern: /\b(?:my name is|i'm called|call me|i am)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi,
    category: 'PII',
    riskLevel: 'MEDIUM',
    reason: 'Sharing your full name can be used for identity theft and social engineering attacks.',
    suggestion: 'Use a pseudonym or initials instead of your real name.'
  },
  // --- PII: Email ---
  {
    name: 'Email Address',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi,
    category: 'PII',
    riskLevel: 'HIGH',
    reason: 'Your email address is a primary identifier that can be linked to your accounts and used to build behavioral profiles.',
    suggestion: 'Use a disposable email address when interacting with AI services.'
  },
  // --- PII: Phone ---
  {
    name: 'Phone Number',
    pattern: /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    category: 'PII',
    riskLevel: 'HIGH',
    reason: 'Phone numbers can be used for SIM swapping attacks, spam, and linking your AI conversations to your real identity.',
    suggestion: 'Never share your phone number with AI services.'
  },
  // --- PII: SSN / National ID ---
  {
    name: 'Social Security Number',
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    category: 'PII',
    riskLevel: 'CRITICAL',
    reason: 'SSN is the most sensitive identity information. Once leaked, it can lead to identity theft and financial ruin.',
    suggestion: 'NEVER share your SSN with any AI service.'
  },
  // --- PII: Address ---
  {
    name: 'Street Address',
    pattern: /\d+\s+[\w\s]+(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Lane|Ln|Drive|Dr|Court|Ct|Way|Circle|Cir|Place|Pl)\b/gi,
    category: 'LOCATION',
    riskLevel: 'HIGH',
    reason: 'Your home address reveals your physical location and can enable stalking or burglary.',
    suggestion: 'Replace with a generic description like "my neighborhood".'
  },
  // --- PII: Date of Birth ---
  {
    name: 'Date of Birth',
    pattern: /\b(?:born on|my birthday|my DOB|DOB is|date of birth)\s*:?\s*\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/gi,
    category: 'PII',
    riskLevel: 'HIGH',
    reason: 'Your date of birth is a key identity verification piece used to build comprehensive profiles.',
    suggestion: 'Never share your exact date of birth online.'
  },
  // --- HEALTH: Medical (with bare condition name) ---
  {
    name: 'Medical Condition',
    pattern: /\b(?:diagnosed with|i have|i suffer from|suffering from|i'm being treated for|for|treated for|having|my condition is)\s+(?:diabetes|cancer|HIV|AIDS|depression|anxiety|bipolar|schizophrenia|PTSD|OCD|ADHD|epilepsy|heart disease|asthma|arthritis|Alzheimer|Parkinson|multiple sclerosis|lupus|Crohn|celiac|thyroid|endometriosis|fibromyalgia)\b/gi,
  },
  // --- HEALTH: Bare condition mention (catch mentions without intro phrases) ---
  {
    name: 'Bare Medical Condition',
    pattern: /\b(?:my\s+)?(?:diabetes|cancer|HIV|AIDS|bipolar disorder|schizophrenia|PTSD|OCD|ADHD|epilepsy|multiple sclerosis|lupus|Crohn|celiac|endometriosis|fibromyalgia)\b(?:(?:,|\.)?\s+(?:my doctor|doctor|prescribed|i take|i'm on|taking|medication))\b/gi,
    category: 'HEALTH',
    riskLevel: 'CRITICAL',
    reason: 'Health information is protected by law. Sharing medical conditions with AI can lead to insurance and employment discrimination.',
    suggestion: 'Discuss health topics generally without revealing personal diagnoses.'
  },
  // --- HEALTH: Mental Health ---
  {
    name: 'Mental Health Disclosure',
    pattern: /\b(?:i feel\s+(?:suicidal|worthless|hopeless|empty|broken)|i want to\s+(?:die|hurt myself|end it)|i've been\s+(?:self-harming|cutting)|i'm\s+(?:having a breakdown|losing my mind|going crazy))\b/gi,
    category: 'HEALTH',
    riskLevel: 'CRITICAL',
    reason: 'This indicates a mental health crisis. AI companies may store this data. Please reach out to a real human for help.',
    suggestion: 'Contact a crisis helpline: 988 Suicide & Crisis Lifeline (call or text 988). AI is not a substitute for professional help.'
  },
  // --- HEALTH: Medication (flexible: supports "prescribed me", "doctor prescribed me", etc.) ---
  {
    name: 'Medication Names',
    pattern: /\b(?:i take|i'm on|prescribed(?:\s+(?:me|to\s+me))?|my doctor(?:\s+(?:has|also))?\s+prescribed(?:\s+me)?|taking|on|was prescribed(?:\s+me)?)\s+(?:Prozac|Zoloft|Lexapro|Xanax|Adderall|Ritalin|Vyvanse|Wellbutrin|Cymbalta|Effexor|Paxil|Klonopin|Ativan|Valium|Ambien|Lithium|Seroquel|Abilify|Risperdal|Zyprexa)\b/gi,
    category: 'HEALTH',
    riskLevel: 'HIGH',
    reason: 'Revealing medication names exposes your health conditions and can be used for targeted advertising.',
    suggestion: 'Refer to medications generically as "my medication" without naming specific drugs.'
  },
  // --- EMOTION: Emotional State ---
  {
    name: 'Deep Emotional Sharing',
    pattern: /\b(?:i'm\s+(?:devastated|heartbroken|terrified|traumatized|abused|lonely|miserable|desperate|furious|overwhelmed|numb)|i can't\s+(?:stop crying|sleep|eat|think straight|go on))\b/gi,
    category: 'EMOTION',
    riskLevel: 'MEDIUM',
    reason: 'Deep emotional sharing creates exploitable psychological profiles that can be used for manipulation.',
    suggestion: 'Be mindful of sharing intense emotions. Consider talking to a trusted friend or professional.'
  },
  // --- EMOTION: Relationship Issues ---
  {
    name: 'Relationship Conflict',
    pattern: /\b(?:my\s+(?:husband|wife|partner|boyfriend|girlfriend|spouse)\s+(?:cheated|left|abused|hit|manipulated|betrayed|ghosted)|i think\s+(?:my|our)\s+(?:partner|spouse) is\s+(?:toxic|abusive|narcissistic|controlling|gaslighting))\b/gi,
    category: 'EMOTION',
    riskLevel: 'HIGH',
    reason: 'Relationship details can be used for social engineering, blackmail, and building manipulative profiles.',
    suggestion: 'Discuss relationship advice generally without sharing identifying details.'
  },
  // --- LOCATION: "I live in/at [place]" (catches lowercase place names too) ---
  {
    name: 'Location Disclosure',
    pattern: /\b(?:i live (?:in|at)|i'm from|i stay (?:in|at))\s+[\w]+(?:\s+[\w]+){0,3}\b/gi,
    category: 'LOCATION',
    riskLevel: 'MEDIUM',
    reason: 'Sharing your location narrows down your identity and can enable stalking or burglary.',
    suggestion: 'Avoid sharing your specific location. Use a generic description instead.'
  },
  // --- LOCATION ---
  {
    name: 'Workplace Name',
    pattern: /\b(?:i work at|i'm employed at|my company is|my office is in)\s+([A-Z][\w\s&]+(?:Inc|Corp|LLC|Ltd|Company|Co|Group|Solutions|Technologies|Labs|Studios))\b/gi,
    category: 'LOCATION',
    riskLevel: 'MEDIUM',
    reason: 'Your workplace helps identify you and can be used for social engineering attacks against your employer.',
    suggestion: 'Refer to your industry or job function instead of naming your specific employer.'
  },
  {
    name: 'School/University',
    pattern: /\b(?:i attend|i study at|i'm a student at|my university is|my school is|going to)\s+([A-Z][\w\s]+(?:University|College|Institute|Academy|School|High School))\b/gi,
    category: 'LOCATION',
    riskLevel: 'MEDIUM',
    reason: 'Your school or university helps pinpoint your location, age range, and social circle.',
    suggestion: 'Refer to your education level or field of study generally.'
  },
  // --- FINANCIAL ---
  {
    name: 'Bank Account',
    pattern: /\b(?:bank account|account number|routing number|IBAN|SWIFT code|sort code)\s*:?\s*\d{4,}/gi,
    category: 'FINANCIAL',
    riskLevel: 'CRITICAL',
    reason: 'Financial account information can lead to direct theft of your money.',
    suggestion: 'Never share banking details with any AI.'
  },
  {
    name: 'Credit Card',
    pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    category: 'FINANCIAL',
    riskLevel: 'CRITICAL',
    reason: 'Credit card numbers can be used for fraudulent charges.',
    suggestion: 'Never share credit card details with AI services.'
  },
  {
    name: 'Income/Salary',
    pattern: /\b(?:my salary is|i earn|i make|my income is|my annual income|my monthly income)\s*\$?\s*[\d,]+/gi,
    category: 'FINANCIAL',
    riskLevel: 'MEDIUM',
    reason: 'Income information helps build your economic profile for targeted advertising and pricing discrimination.',
    suggestion: 'Discuss financial topics without revealing specific numbers.'
  },
  // --- CREDENTIALS ---
  {
    name: 'Password/Credential',
    pattern: /\b(?:my password is|my pass is|my PIN is|my security question|my secret answer is|username is|password of|password for|my password\b|convert.*(?:hash|encrypt|decode)|hack\s+(?:my|this|the)\s+password)\b/gi,
    category: 'CREDENTIAL',
    riskLevel: 'CRITICAL',
    reason: 'Sharing credentials with AI services is extremely dangerous. These conversations may be stored or leaked.',
    suggestion: 'NEVER share passwords or security credentials with any AI. Use a password manager.'
  },
  // --- RELATIONSHIP: Children (flexible: supports "My son NAME goes to") ---
  {
    name: 'Children Information',
    pattern: /\bmy\s+(?:son|daughter|child|kids?|baby)\s+(?:[A-Z][a-z]+\s+)?(?:is|has|goes to|attends|was born|named|studies at)\b/gi,
    category: 'RELATIONSHIP',
    riskLevel: 'HIGH',
    reason: 'Information about your children can endanger them and can be exploited by bad actors.',
    suggestion: 'Never share identifying information about your children with AI services.'
  },
  // --- IMAGE: Photo Sharing ---
  {
    name: 'Photo Upload Intent',
    pattern: /\b(?:here'?s?\s+(?:a|my|the)\s+photo|uploaded\s+(?:a|my|the)\s+(?:picture|photo|image|selfie)|attached\s+(?:a|my|the)\s+photo|look\s+at\s+(?:this|my)\s+(?:picture|photo|image))\b/gi,
    category: 'IMAGE',
    riskLevel: 'HIGH',
    reason: 'Uploading personal photos to AI services means permanent loss of control. Photos may be used for training or leaked.',
    suggestion: "Avoid uploading personal photos. If you must, use images that don't contain faces."
  },
  // --- PERMISSION: Dangerous Grants (split into multiple flexible patterns) ---
  {
    name: 'Permission Grant - Direct',
    pattern: /\b(?:grant\s+(?:me\s+)?access|allow\s+it|enable\s+(?:it|access)|turn\s+on\s+(?:access|permission)|full\s+access|all\s+permissions|admin\s+access|system\s+access|access\s+to\s+my\s+(?:files|camera|microphone|location|contacts|photos|data|computer|phone))\b/gi,
    category: 'PERMISSION',
    riskLevel: 'CRITICAL',
    reason: 'Granting broad permissions to AI agents can compromise your entire device and lead to data exfiltration.',
    suggestion: 'Only grant minimal, specific permissions. Never allow blanket access to your device.'
  },
  {
    name: 'Permission Grant - Conversational',
    pattern: /\b(?:yes,?\s+(?:you can|go ahead|sure|please do|of course|please)\s+)?(?:grant|allow|enable|give)\s+(?:me\s+)?(?:access|permission)\s+(?:to\s+)?(?:my\s+)?(?:files|camera|microphone|location|contacts|photos|data|computer|phone|everything|all)\b/gi,
    category: 'PERMISSION',
    riskLevel: 'CRITICAL',
    reason: 'Granting broad permissions to AI agents can compromise your entire device and lead to data exfiltration.',
    suggestion: 'Only grant minimal, specific permissions. Never allow blanket access to your device.'
  },
];

// ============================================================
// LAYER 2: NER Entity Simulation
// ============================================================

const NER_PATTERNS = [
  {
    name: 'Person Name Reference',
    pattern: /\b(?:my (?:mom|dad|mother|father|brother|sister|aunt|uncle|cousin|grandmother|grandfather|wife|husband|partner|boyfriend|girlfriend))'?\s+(?:is (?:called|named)\s+)?([A-Z][a-z]+)/g,
    category: 'RELATIONSHIP',
    riskLevel: 'MEDIUM',
    reason: 'Naming family members helps build your social graph for social engineering and targeted scams.'
  },
  {
    name: 'City/Location',
    pattern: /\b(?:i live (?:in|at)|i'm from|located in|based in|my city is|i stay (?:in|at)|in\s+(?:downtown|midtown|uptown))\s+([A-Z]?[a-zA-Z][\w\s]*(?:City|Town|Village|pur|pura|puram|nagar|gaon|wadi|bad|ganj)?(?:\s+[A-Z]?[a-z]+)*)\b/g,
    category: 'LOCATION',
    riskLevel: 'MEDIUM',
    reason: 'Your city narrows down your identity significantly and makes you easily identifiable.'
  },
  {
    name: 'Age Disclosure',
    pattern: /\b(?:i'?m|i\s+am|my age is|im\s+)\s+(?:over |under |almost )?(\d{1,3})(?:\s+years? old)?\b/gi,
    category: 'PII',
    riskLevel: 'LOW',
    reason: 'Your age, combined with other information, helps build a unique profile.'
  },
  {
    name: 'IP Address',
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    category: 'CREDENTIAL',
    riskLevel: 'HIGH',
    reason: 'Your IP address reveals your approximate location and ISP.'
  },
];

// ============================================================
// LAYER 3: Context-Aware Deep Analysis
// ============================================================

const CONTEXT_RULES = [
  {
    triggers: ['password reset', 'forgot password', 'reset my password', 'change password', 'new password'],
    category: 'CREDENTIAL', riskLevel: 'HIGH',
    reason: 'Discussions about password resets can reveal security practices and make you a target for phishing.',
    suggestion: 'Handle password resets directly through official websites.'
  },
  {
    triggers: ['travel plans', 'going to trip', 'vacation to', 'flight to', 'hotel in', 'leaving town', 'planning to go', 'planing to go', 'planning to visit', 'planing to visit', 'planning a trip', 'planing a trip', 'trip to', 'going to london', 'going to paris', 'going to new york', 'visiting ', 'flying to', 'traveling to', 'travelling to'],
    category: 'LOCATION', riskLevel: 'MEDIUM',
    reason: 'Travel plans reveal when you will be away from home, making you vulnerable to burglary.',
    suggestion: 'Avoid sharing specific travel dates and destinations with AI services.'
  },
  {
    triggers: ['alone at home', 'home alone', 'nobody is home', 'living by myself', 'house is empty'],
    category: 'LOCATION', riskLevel: 'HIGH',
    reason: 'Revealing that you are alone or your home is empty poses physical safety risks.',
    suggestion: 'Never share your physical security situation with AI services.'
  },
  {
    triggers: ['confess', 'secret', 'nobody knows', 'ive never told anyone', 'between us', 'dont tell anyone'],
    category: 'EMOTION', riskLevel: 'HIGH',
    reason: 'Information shared as "secrets" with AI is stored on servers and could be accessed by employees or hackers.',
    suggestion: 'Nothing shared with AI is truly secret. Assume everything could become public.'
  },
  {
    triggers: ['legal trouble', 'sued', 'arrested', 'court case', 'lawsuit', 'criminal', 'investigation', 'police'],
    category: 'EMOTION', riskLevel: 'HIGH',
    reason: 'Legal matters are highly sensitive and could be used against you. AI conversations are not protected by attorney-client privilege.',
    suggestion: 'Discuss legal matters only with qualified legal professionals.'
  },
  {
    triggers: ['crypto wallet', 'bitcoin', 'ethereum', 'private key', 'seed phrase', 'mnemonic', 'wallet address'],
    category: 'FINANCIAL', riskLevel: 'CRITICAL',
    reason: 'Cryptocurrency keys and seed phrases give full access to your funds. Sharing them means potential total financial loss.',
    suggestion: 'NEVER share crypto private keys or seed phrases with any AI or online service.'
  },
];

// ============================================================
// RISK SCORING ENGINE
// ============================================================

const RISK_SCORE_MAP = { LOW: 10, MEDIUM: 30, HIGH: 60, CRITICAL: 90 };

function calculateOverallRisk(items) {
  if (items.length === 0) return { level: 'LOW', score: 0 };

  let totalScore = 0;
  let maxItemScore = 0;
  let hasCritical = false;

  for (const item of items) {
    const score = RISK_SCORE_MAP[item.riskLevel] || 10;
    totalScore += score;
    if (score > maxItemScore) maxItemScore = score;
    if (item.riskLevel === 'CRITICAL') hasCritical = true;
  }

  const normalizedScore = Math.min(100, Math.round(totalScore / items.length + (items.length > 1 ? 10 : 0)));

  if (hasCritical) return { level: 'CRITICAL', score: Math.max(normalizedScore, 85) };
  if (maxItemScore >= 60) return { level: 'HIGH', score: Math.max(normalizedScore, 60) };
  if (totalScore >= 40 || items.length >= 3) return { level: 'MEDIUM', score: Math.min(59, normalizedScore) };
  return { level: 'LOW', score: Math.min(25, normalizedScore) };
}

// ============================================================
// SANITIZATION ENGINE
// ============================================================

function getReplacement(category) {
  const map = {
    PII: '[PERSONAL INFO REDACTED]',
    HEALTH: '[HEALTH INFO REDACTED]',
    EMOTION: '[EMOTIONAL CONTENT REDACTED]',
    LOCATION: '[LOCATION REDACTED]',
    FINANCIAL: '[FINANCIAL INFO REDACTED]',
    RELATIONSHIP: '[RELATIONSHIP INFO REDACTED]',
    IMAGE: '[IMAGE REFERENCE REDACTED]',
    PERMISSION: '[PERMISSION REQUEST REDACTED]',
    CREDENTIAL: '[CREDENTIAL REDACTED]',
  };
  return map[category] || '[REDACTED]';
}

function sanitizeText(text, items) {
  let sanitized = text;
  const sorted = [...items].sort((a, b) => b.start - a.start);
  for (const item of sorted) {
    const replacement = getReplacement(item.category);
    sanitized = sanitized.substring(0, item.start) + replacement + sanitized.substring(item.end);
  }
  return sanitized;
}

// ============================================================
// CATEGORY HELPERS
// ============================================================

const CATEGORY_NAMES = {
  PII: 'Personally Identifiable Information',
  HEALTH: 'Health & Medical',
  EMOTION: 'Emotional & Psychological',
  LOCATION: 'Location & Places',
  FINANCIAL: 'Financial',
  RELATIONSHIP: 'Relationships & Family',
  IMAGE: 'Images & Photos',
  PERMISSION: 'Permissions & Access',
  CREDENTIAL: 'Credentials & Security',
};

function generateExplanation(level, categories, itemCount) {
  const categoryNames = categories.map(c => CATEGORY_NAMES[c] || c).join(', ');
  const catStr = categories.length > 1 ? `categories: ${categoryNames}` : `the ${categoryNames}`;

  switch (level) {
    case 'CRITICAL':
      return `We detected ${itemCount} sensitive item${itemCount > 1 ? 's' : ''} in ${catStr} that pose a critical risk to your privacy. This data could lead to identity theft, financial fraud, or physical danger. We strongly recommend blocking this message.`;
    case 'HIGH':
      return `Your message contains ${itemCount} sensitive item${itemCount > 1 ? 's' : ''} in ${catStr}. Sharing this data with AI services may lead to profile building, targeted advertising, or data breaches.`;
    case 'MEDIUM':
      return `We found ${itemCount} item${itemCount > 1 ? 's' : ''} that could reveal personal information in ${catStr}. While not immediately dangerous, this data contributes to your digital profile over time.`;
    case 'LOW':
      return `Your message appears relatively safe. We detected ${itemCount} minor item${itemCount > 1 ? 's' : ''} in ${catStr} that carry low risk.`;
    default:
      return 'No significant privacy risks detected.';
  }
}

// ============================================================
// MAIN SCAN FUNCTION
// ============================================================

function scanMessage(message, customRules) {
  const allItems = [];
  const categories = new Set();
  const warnings = [];

  // Layer 1: Rule-based
  for (const rule of PRIVACY_RULES) {
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
    let match;
    while ((match = regex.exec(message)) !== null) {
      allItems.push({
        text: match[0],
        category: rule.category,
        riskLevel: rule.riskLevel,
        reason: rule.reason,
        suggestion: rule.suggestion,
        start: match.index,
        end: match.index + match[0].length,
      });
      categories.add(rule.category);
    }
  }

  // Layer 2: NER
  for (const ner of NER_PATTERNS) {
    const regex = new RegExp(ner.pattern.source, ner.pattern.flags);
    let match;
    while ((match = regex.exec(message)) !== null) {
      allItems.push({
        text: match[0],
        category: ner.category,
        riskLevel: ner.riskLevel,
        reason: ner.reason,
        start: match.index,
        end: match.index + match[0].length,
      });
      categories.add(ner.category);
    }
  }

  // Layer 3: Context
  const lowerMessage = message.toLowerCase();
  for (const ctx of CONTEXT_RULES) {
    for (const trigger of ctx.triggers) {
      if (lowerMessage.includes(trigger.toLowerCase())) {
        const idx = lowerMessage.indexOf(trigger.toLowerCase());
        allItems.push({
          text: trigger,
          category: ctx.category,
          riskLevel: ctx.riskLevel,
          reason: ctx.reason,
          suggestion: ctx.suggestion,
          start: idx,
          end: idx + trigger.length,
        });
        categories.add(ctx.category);
      }
    }
  }

  // Layer 4: Custom user rules
  if (customRules && Array.isArray(customRules)) {
    for (const rule of customRules) {
      if (!rule.isActive) continue;
      try {
        const regex = new RegExp(rule.pattern, 'gi');
        let match;
        while ((match = regex.exec(message)) !== null) {
          allItems.push({
            text: match[0],
            category: rule.category || 'PII',
            riskLevel: rule.riskLevel || 'MEDIUM',
            reason: `This matches your custom rule: "${rule.name}"`,
            start: match.index,
            end: match.index + match[0].length,
          });
          categories.add(rule.category || 'PII');
        }
      } catch (e) {
        // Invalid regex, skip
      }
    }
  }

  // Calculate risk
  const { level, score } = calculateOverallRisk(allItems);

  // Sanitize
  const sanitizedText = allItems.length > 0 ? sanitizeText(message, allItems) : message;

  // Explanation
  const explanation = generateExplanation(level, [...categories], allItems.length);

  // Warnings
  if (level === 'CRITICAL') {
    warnings.push('CRITICAL: This message contains highly sensitive information. Sending could lead to identity theft, financial loss, or physical danger.');
  } else if (level === 'HIGH') {
    warnings.push('HIGH: This message contains highly sensitive personal data. Consider whether sharing this is necessary.');
  }
  if (allItems.length > 3) {
    warnings.push('Multiple categories of sensitive data detected. The more personal data you share, the easier it is to build a complete profile.');
  }

  return {
    riskLevel: level,
    riskScore: score,
    categories: [...categories],
    items: allItems,
    sanitizedText,
    explanation,
    warnings,
  };
}

// Make available globally for content scripts
if (typeof globalThis !== 'undefined') {
  globalThis.PrivacyGuardScanner = { scanMessage, CATEGORY_NAMES };
}
