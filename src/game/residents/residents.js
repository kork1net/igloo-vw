// Stable IDs will also identify residents when quest chains are added.
export const residents = [
    {
        id: 'rani',
        room: 'Shop',
        name: 'רני',
        role: 'בעל החנות',
        texture: 'resident:rani',
        image: 'assets/residents/rani.png',
        displayHeight: 148,
        position: { x: 0.32, y: 0.45 },
        greeting: 'שלום, אני רני, בעל החנות. אני מקפיד על הסדר ועל האיכות של כל פריט שמגיע למדפים שלי. תבחרו בנחת, ואם תצטרכו עצה, אני כאן. משמח אותי לראות אתכם מתקדמים ומוצאים את הסגנון שלכם. יש לכם במה להתגאות.',
        questChainIds: [],
        speechLines: [
            'בחנות שלי, כל פריט נבדק עד הפרט האחרון.',
            'קחו את הזמן. בחירה טובה שווה את זה.',
            'אתם מתקדמים יפה. יש לכם במה להתגאות.',
            'טוב לראות אתכם. אם צריך עזרה, אני כאן.'
        ]
    },
    {
        id: 'mia',
        room: 'Cafe',
        name: 'מיה',
        role: 'בעלת בית הקפה',
        texture: 'resident:mia',
        image: 'assets/residents/mia.png',
        displayHeight: 148,
        position: { x: 0.29, y: 0.4 },
        greeting: 'ברוכים הבאים לבית הקפה! אני מיה, בעלת המקום. זה המקום שלי לקפה חם, למשהו מתוק ולשיחה טובה. תרגישו בבית!',
        questChainIds: [],
        speechLines: [
            'מי רוצה להתחמם עם כוס קפה?',
            'אין כמו משהו מתוק ביום מושלג!',
            'ברוכים הבאים! תמיד יש כאן מקום לחברים.'
        ]
    },
    {
        id: 'leo',
        room: 'Game',
        name: 'ליאו',
        role: 'השוטר המקומי',
        texture: 'resident:leo',
        image: 'assets/residents/Leo.png',
        displayHeight: 148,
        position: { x: 0.65, y: 0.6 },
        greeting: 'שלום! אני ליאו, השוטר של האזור. אני כאן כדי לשמור על הסדר ולעזור לתושבים. נעים להכיר!',
        questChainIds: ['leo-welcome'],
        speechLines: [
            '.יום שקט הוא יום מוצלח בשביל שוטר',
            '.צריכים עזרה? אני כאן בשבילכם',
            '!זכרו לשמור על הסדר ולעזור זה לזה',
            '.הכול נראה תקין בסיור של היום',
            '.שלום לתושבים החדשים! ברוכים הבאים '
        ]
    }
];
