// Text of the public /account-deletion page in the four shipped languages. Static content kept in
// code (not in the i18n bundles) for the same reason as the privacy policy and terms: one
// reviewable reference text per language. Keep the four versions in step -- the spec checks that
// they have the same structure.
//
// Inline markup: **bold** and [label](/route) or [label](mailto:...) links, parsed by
// account-deletion.page.ts, never injected as HTML.

import type { LangCode } from '../../core/services/language.service';

export type DeletionBlock =
  | { p: string }
  | { ul: string[] }
  | { ol: string[] };

export interface DeletionSection {
  heading: string;
  blocks: DeletionBlock[];
}

export interface AccountDeletionContent {
  title: string;
  metaTitle: string;
  metaDescription: string;
  updated: string;
  intro: string;
  sections: DeletionSection[];
  back: string;
}

export const ACCOUNT_DELETION_UPDATED_ISO = '2026-10-13';

export const ACCOUNT_DELETION_CONTENT: Record<LangCode, AccountDeletionContent> = {
  ar: {
    title: 'حذف الحساب — هدهد نيست (HudhudNest)',
    metaTitle: 'حذف الحساب والبيانات',
    metaDescription: 'كيف تطلب حذف حسابك وبياناتك من هدهد نيست، وما الذي يُحذف وما الذي يُحتفظ به ولماذا.',
    updated: 'آخر تحديث: 13 أكتوبر 2026',
    intro:
      'يمكنك حذف حسابك في "هدهد نيست" نهائياً في أي وقت، من داخل التطبيق (Android وiOS) أو من نسخة الويب — بدون الحاجة لتثبيت التطبيق لبدء الطلب إذا كنت تفضّل التواصل معنا مباشرة (انظر القسم الأخير أدناه).',
    sections: [
      {
        heading: 'كيف تحذف حسابك (داخل التطبيق أو الويب)',
        blocks: [
          {
            ol: [
              'سجّل الدخول إلى حسابك.',
              'افتح **الملف الشخصي** ← **منطقة الخطر (Danger Zone)** أسفل الصفحة ← اضغط **"حذف الحساب نهائياً"**.',
              '(اختياري) قبل ذلك، يمكنك تنزيل نسخة من بياناتك من قسم **"بياناتك"** في الصفحة نفسها.',
              'اقرأ التحذير الذي يوضّح ما سيُحذف وما سيبقى محفوظاً، ثم اضغط "متابعة".',
              'أدخل كلمة المرور الحالية (إن كان حسابك يستخدم كلمة مرور — لا يُطلب هذا من حسابات الدخول عبر جوجل/آبل فقط)، ثم اكتب **DELETE** في الحقل المخصّص للتأكيد النهائي.',
              'عند تأكيد الطلب **يُجدوَل الحذف بعد 30 يومًا** ولا يُحذف شيء فوراً: يبقى حسابك يعمل خلال هذه المدة، وتظهر لك ملاحظة بتاريخ الحذف مع زر **"إلغاء طلب الحذف"**. بانقضاء المدة يُنفَّذ الحذف تلقائياً وتُسجَّل خروجك من جميع أجهزتك. **بعد التنفيذ لا يمكن التراجع.**'
            ]
          }
        ]
      },
      {
        heading: 'ما الذي يُحذف عند تنفيذ الحذف؟',
        blocks: [
          {
            ul: [
              'اسمك، صورتك الشخصية، نبذتك التعريفية، ومعلومات التواصل الخاصة بك.',
              'بريدك الإلكتروني ورقم هاتفك المسجَّلان بالحساب، وأي ربط بحساب جوجل/آبل — لن يعود بإمكانك تسجيل الدخول إلى هذا الحساب بها مجدداً.',
              'كلمة المرور المخزَّنة (بصيغتها المشفَّرة) ورموز الإشعارات الخاصة بأجهزتك.',
              'جميع جلسات الدخول النشطة على كل أجهزتك.'
            ]
          }
        ]
      },
      {
        heading: 'ما الذي يبقى محفوظاً (دون بياناتك الشخصية)؟',
        blocks: [
          {
            ul: [
              'الرسائل والتقييمات التي نشرتها سابقاً تبقى ظاهرة للمستخدمين الآخرين — لكن باسم **"مستخدم محذوف"** بدل اسمك الحقيقي، وليس باسمك أو بياناتك الشخصية.',
              'سجلات أمنية داخلية محدودة (لمنع إساءة الاستخدام ومتابعة حوادث أمنية)، لا تحتوي أي من بياناتك الشخصية بعد إتمام الحذف.',
              '**ملاحظة:** عند تنفيذ حذف الحساب تُخفى إعلاناتك عن الموقع فوراً (فلا تبقى إعلانات بلا جهة اتصال)، ثم تُحذف نهائياً مع صورها بعد مهلة 30 يوماً. أما خلال مهلة التراجع التي تسبق التنفيذ فتبقى إعلاناتك كما هي. وإن كنت عضواً في مكتب عقاري تبقى إعلاناتك وتنتقل إلى صاحب المكتب، فتصله الاستفسارات عنها.'
            ]
          }
        ]
      },
      {
        heading: 'إلغاء طلب الحذف',
        blocks: [
          {
            p: 'إن غيّرت رأيك خلال الثلاثين يومًا، سجّل الدخول واضغط **"إلغاء طلب الحذف"** من الملاحظة أعلى الصفحة أو من **منطقة الخطر** في ملفك الشخصي. لا تُطلب كلمة المرور للإلغاء، ويبقى حسابك كما هو.'
          }
        ]
      },
      {
        heading: 'المصادقة المطلوبة',
        blocks: [
          {
            p: 'حذف الحساب عملية حساسة ونهائية، لذا نطلب تسجيل الدخول أولاً، ثم كلمة المرور الحالية مجدداً كخطوة تأكيد إضافية (لحسابات البريد/كلمة المرور فقط)، إضافة إلى كتابة كلمة تأكيد صريحة قبل قبول طلب الحذف.'
          }
        ]
      },
      {
        heading: 'لا تستطيع تسجيل الدخول؟',
        blocks: [
          {
            p: 'إن كنت لا تستطيع الوصول إلى حسابك (فقدان الوصول لكلمة المرور أو رقم الهاتف مثلاً) وترغب بطلب حذف حسابك وبياناتك، راسلنا من البريد الإلكتروني المسجَّل في حسابك على [support@hudhudnest.com](mailto:support@hudhudnest.com?subject=%D8%B7%D9%84%D8%A8%20%D8%AD%D8%B0%D9%81%20%D8%AD%D8%B3%D8%A7%D8%A8) موضّحاً طلبك، وسنتحقق من هويتك قبل تنفيذ الحذف يدوياً.'
          }
        ]
      },
      {
        heading: 'سياسة الخصوصية',
        blocks: [
          {
            p: 'لمزيد من التفاصيل حول البيانات التي نجمعها ومدة الاحتفاظ بها، راجع [سياسة الخصوصية](/privacy-policy).'
          }
        ]
      }
    ],
    back: 'العودة إلى الرئيسية'
  },

  en: {
    title: 'Delete your account — HudhudNest',
    metaTitle: 'Delete your account and data',
    metaDescription:
      'How to request deletion of your HudhudNest account and data, what is deleted, what is kept and why.',
    updated: 'Last updated: October 13, 2026',
    intro:
      'You can permanently delete your HudhudNest account at any time, from inside the app (Android and iOS) or from the website. If you would rather contact us directly, you can start the request without installing the app (see the last section below).',
    sections: [
      {
        heading: 'How to delete your account (in the app or on the web)',
        blocks: [
          {
            ol: [
              'Sign in to your account.',
              'Open **Profile** → **Danger Zone** at the bottom of the page → tap **"Delete account permanently"**.',
              '(Optional) Before that, you can download a copy of your data from the **"Your data"** section on the same page.',
              'Read the warning that explains what will be deleted and what will be kept, then tap "Continue".',
              'Enter your current password (if your account uses one — this is not asked of accounts that only sign in with Google/Apple), then type **DELETE** in the final confirmation field.',
              'Once you confirm, **deletion is scheduled for 30 days later** and nothing is deleted right away: your account keeps working during that time, and a notice shows the deletion date with a **"Cancel deletion request"** button. When the period ends, the deletion runs automatically and you are signed out of all your devices. **Once it has run, it cannot be undone.**'
            ]
          }
        ]
      },
      {
        heading: 'What is deleted when the deletion runs',
        blocks: [
          {
            ul: [
              'Your name, profile photo, biography and contact details.',
              'The email address and phone number registered to the account, and any link to a Google/Apple account — you will no longer be able to sign in to this account with them.',
              'The stored password (in its hashed form) and the notification tokens of your devices.',
              'All active sign-in sessions on all of your devices.'
            ]
          }
        ]
      },
      {
        heading: 'What is kept (without your personal data)',
        blocks: [
          {
            ul: [
              'Messages and ratings you posted earlier stay visible to other users — but under the name **"Deleted User"** instead of your real name, and not with your name or personal data.',
              'A limited set of internal security logs (to prevent abuse and follow up security incidents), which contain none of your personal data once the deletion is complete.',
              '**Note:** when the account deletion is carried out, your listings are taken off the site right away (so no listing is left without a contact person) and are permanently deleted, with their photos, after a 30-day period. While the cancellation period before the deletion runs, your listings stay as they are. If you are a member of a real-estate office, your listings stay up and move to the office owner, who then receives the inquiries about them.'
            ]
          }
        ]
      },
      {
        heading: 'Cancelling a deletion request',
        blocks: [
          {
            p: 'If you change your mind within the thirty days, sign in and tap **"Cancel deletion request"** in the notice at the top of the page or in the **Danger Zone** of your profile. No password is needed to cancel, and your account stays exactly as it was.'
          }
        ]
      },
      {
        heading: 'Authentication required',
        blocks: [
          {
            p: 'Deleting an account is sensitive and final, so we ask you to sign in first, then to enter your current password again as an extra confirmation (for email/password accounts only), and to type an explicit confirmation word before a deletion request is accepted.'
          }
        ]
      },
      {
        heading: 'Cannot sign in?',
        blocks: [
          {
            p: 'If you cannot access your account (for example you lost access to your password or phone number) and want to request deletion of your account and data, write to us from the email address registered to your account at [support@hudhudnest.com](mailto:support@hudhudnest.com?subject=Account%20deletion%20request) explaining your request. We will verify your identity before carrying out the deletion manually.'
          }
        ]
      },
      {
        heading: 'Privacy policy',
        blocks: [
          {
            p: 'For more detail on the data we collect and how long we keep it, see the [Privacy Policy](/privacy-policy).'
          }
        ]
      }
    ],
    back: 'Back to home'
  },

  de: {
    title: 'Konto löschen — HudhudNest',
    metaTitle: 'Konto und Daten löschen',
    metaDescription:
      'So beantragen Sie die Löschung Ihres HudhudNest-Kontos und Ihrer Daten, was gelöscht wird, was erhalten bleibt und warum.',
    updated: 'Zuletzt aktualisiert: 13. Oktober 2026',
    intro:
      'Sie können Ihr HudhudNest-Konto jederzeit endgültig löschen, in der App (Android und iOS) oder auf der Website. Wenn Sie uns lieber direkt kontaktieren, können Sie die Anfrage auch ohne Installation der App starten (siehe letzten Abschnitt unten).',
    sections: [
      {
        heading: 'So löschen Sie Ihr Konto (in der App oder im Web)',
        blocks: [
          {
            ol: [
              'Melden Sie sich bei Ihrem Konto an.',
              'Öffnen Sie **Profil** → **Gefahrenzone** am Ende der Seite → tippen Sie auf **„Konto dauerhaft löschen“**.',
              '(Optional) Vorher können Sie im Bereich **„Deine Daten“** auf derselben Seite eine Kopie Ihrer Daten herunterladen.',
              'Lesen Sie den Hinweis, der erklärt, was gelöscht wird und was erhalten bleibt, und tippen Sie dann auf „Weiter“.',
              'Geben Sie Ihr aktuelles Passwort ein (falls Ihr Konto eines verwendet — bei Konten, die sich nur über Google/Apple anmelden, wird es nicht verlangt) und tippen Sie dann **DELETE** in das Feld für die abschließende Bestätigung.',
              'Nach der Bestätigung wird die **Löschung für 30 Tage später vorgemerkt**, sofort wird nichts gelöscht: Ihr Konto funktioniert in dieser Zeit weiter, und ein Hinweis zeigt das Löschdatum mit der Schaltfläche **„Löschantrag abbrechen“**. Nach Ablauf der Frist wird die Löschung automatisch ausgeführt und Sie werden auf allen Geräten abgemeldet. **Nach der Ausführung ist sie nicht mehr rückgängig zu machen.**'
            ]
          }
        ]
      },
      {
        heading: 'Was bei der Löschung entfernt wird',
        blocks: [
          {
            ul: [
              'Ihr Name, Ihr Profilfoto, Ihre Kurzbeschreibung und Ihre Kontaktdaten.',
              'Die mit dem Konto verknüpfte E-Mail-Adresse und Telefonnummer sowie jede Verknüpfung mit einem Google-/Apple-Konto — damit können Sie sich nicht mehr bei diesem Konto anmelden.',
              'Das gespeicherte Passwort (in gehashter Form) und die Benachrichtigungs-Token Ihrer Geräte.',
              'Alle aktiven Anmeldesitzungen auf allen Ihren Geräten.'
            ]
          }
        ]
      },
      {
        heading: 'Was erhalten bleibt (ohne Ihre personenbezogenen Daten)',
        blocks: [
          {
            ul: [
              'Von Ihnen früher veröffentlichte Nachrichten und Bewertungen bleiben für andere Nutzer sichtbar — aber unter dem Namen **„Gelöschter Nutzer“** statt Ihres echten Namens und nicht mit Ihrem Namen oder Ihren persönlichen Daten.',
              'Begrenzte interne Sicherheitsprotokolle (zur Missbrauchsvermeidung und zur Verfolgung von Sicherheitsvorfällen), die nach Abschluss der Löschung keine personenbezogenen Daten von Ihnen mehr enthalten.',
              '**Hinweis:** Sobald die Kontolöschung ausgeführt wird, werden Ihre Anzeigen sofort offline genommen (damit keine Anzeige ohne Ansprechperson online bleibt) und nach einer Frist von 30 Tagen samt Fotos endgültig gelöscht. Während der Rücktrittsfrist vor der Ausführung bleiben Ihre Anzeigen unverändert. Wenn Sie Mitglied eines Immobilienbüros sind, bleiben Ihre Anzeigen bestehen und gehen auf den Büroinhaber über, der dann die Anfragen dazu erhält.'
            ]
          }
        ]
      },
      {
        heading: 'Löschantrag abbrechen',
        blocks: [
          {
            p: 'Wenn Sie es sich innerhalb der dreißig Tage anders überlegen, melden Sie sich an und tippen Sie im Hinweis oben auf der Seite oder in der **Gefahrenzone** Ihres Profils auf **„Löschantrag abbrechen“**. Zum Abbrechen ist kein Passwort nötig, und Ihr Konto bleibt unverändert.'
          }
        ]
      },
      {
        heading: 'Erforderliche Authentifizierung',
        blocks: [
          {
            p: 'Die Kontolöschung ist sensibel und endgültig. Deshalb verlangen wir zuerst die Anmeldung, dann erneut Ihr aktuelles Passwort als zusätzliche Bestätigung (nur bei Konten mit E-Mail/Passwort) und die Eingabe eines ausdrücklichen Bestätigungsworts, bevor ein Löschantrag angenommen wird.'
          }
        ]
      },
      {
        heading: 'Anmeldung nicht möglich?',
        blocks: [
          {
            p: 'Wenn Sie keinen Zugriff auf Ihr Konto haben (z. B. weil Sie den Zugang zu Passwort oder Telefonnummer verloren haben) und die Löschung Ihres Kontos und Ihrer Daten beantragen möchten, schreiben Sie uns von der in Ihrem Konto hinterlegten E-Mail-Adresse an [support@hudhudnest.com](mailto:support@hudhudnest.com?subject=Antrag%20auf%20Kontol%C3%B6schung) und schildern Sie Ihr Anliegen. Wir prüfen Ihre Identität, bevor wir die Löschung manuell durchführen.'
          }
        ]
      },
      {
        heading: 'Datenschutzerklärung',
        blocks: [
          {
            p: 'Weitere Einzelheiten dazu, welche Daten wir erheben und wie lange wir sie aufbewahren, finden Sie in der [Datenschutzerklärung](/privacy-policy).'
          }
        ]
      }
    ],
    back: 'Zurück zur Startseite'
  },
  tr: {
    title: 'Hesabınızı silin — HudhudNest',
    metaTitle: 'Hesabınızı ve verilerinizi silin',
    metaDescription:
      'HudhudNest hesabınızın ve verilerinizin silinmesini nasıl talep edeceğiniz; nelerin silindiği, nelerin saklandığı ve nedenleri.',
    updated: 'Son güncelleme: 13 Ekim 2026',
    intro:
      'HudhudNest hesabınızı istediğiniz zaman uygulama içinden (Android ve iOS) veya web sitesinden kalıcı olarak silebilirsiniz. Bizimle doğrudan iletişime geçmeyi tercih ederseniz, uygulamayı yüklemeden de talebi başlatabilirsiniz (aşağıdaki son bölüme bakın).',
    sections: [
      {
        heading: 'Hesabınızı nasıl silersiniz (uygulamada veya web\'de)',
        blocks: [
          {
            ol: [
              'Hesabınızda oturum açın.',
              '**Profil** → sayfanın altındaki **Tehlikeli Bölge** (Danger Zone) bölümünü açın → **"Hesabı kalıcı olarak sil"** düğmesine dokunun.',
              '(İsteğe bağlı) Bundan önce, aynı sayfadaki **"Verileriniz"** bölümünden verilerinizin bir kopyasını indirebilirsiniz.',
              'Nelerin silineceğini ve nelerin saklanacağını açıklayan uyarıyı okuyun, ardından "Devam"a dokunun.',
              'Geçerli parolanızı girin (hesabınız parola kullanıyorsa — yalnızca Google/Apple ile giriş yapan hesaplardan istenmez), ardından son onay alanına **DELETE** yazın.',
              'Onayladığınızda **silme işlemi 30 gün sonrasına planlanır** ve hiçbir şey hemen silinmez: hesabınız bu süre boyunca çalışmaya devam eder ve silme tarihini gösteren bir not ile **"Silme talebini iptal et"** düğmesi görünür. Süre dolduğunda silme otomatik olarak çalışır ve tüm cihazlarınızdaki oturumunuz kapatılır. **Çalıştıktan sonra geri alınamaz.**'
            ]
          }
        ]
      },
      {
        heading: 'Silme işlemi çalıştığında nelerin silindiği',
        blocks: [
          {
            ul: [
              'Adınız, profil fotoğrafınız, özgeçmişiniz ve iletişim bilgileriniz.',
              'Hesaba kayıtlı e-posta adresi ve telefon numarası ile bir Google/Apple hesabına olan her bağlantı — artık bunlarla bu hesapta oturum açamazsınız.',
              'Saklanan parola (özet biçiminde) ve cihazlarınızın bildirim belirteçleri.',
              'Tüm cihazlarınızdaki etkin oturumların hepsi.'
            ]
          }
        ]
      },
      {
        heading: 'Nelerin saklandığı (kişisel verileriniz olmadan)',
        blocks: [
          {
            ul: [
              'Daha önce yayınladığınız mesajlar ve puanlar diğer kullanıcılara görünür kalır — ancak gerçek adınız yerine **"Silinmiş Kullanıcı"** adı altında ve adınız veya kişisel verileriniz olmadan.',
              'Sınırlı sayıda dahili güvenlik günlüğü (kötüye kullanımı önlemek ve güvenlik olaylarını izlemek için); silme tamamlandıktan sonra bunlar kişisel verilerinizin hiçbirini içermez.',
              '**Not:** hesap silme işlemi gerçekleştirildiğinde ilanlarınız hemen siteden kaldırılır (böylece hiçbir ilan iletişim kişisiz kalmaz) ve 30 günlük bir sürenin ardından fotoğraflarıyla birlikte kalıcı olarak silinir. Silme çalışmadan önceki iptal süresi boyunca ilanlarınız olduğu gibi kalır. Bir emlak ofisinin üyesiyseniz, ilanlarınız yayında kalır ve ofis sahibine devredilir; ilanlara ilişkin sorular artık ona ulaşır.'
            ]
          }
        ]
      },
      {
        heading: 'Silme talebini iptal etme',
        blocks: [
          {
            p: 'Otuz gün içinde fikrinizi değiştirirseniz, oturum açın ve sayfanın üstündeki notta veya profilinizin **Tehlikeli Bölge**sinde **"Silme talebini iptal et"** düğmesine dokunun. İptal için parola gerekmez ve hesabınız tamamen eskisi gibi kalır.'
          }
        ]
      },
      {
        heading: 'Kimlik doğrulama gerekli',
        blocks: [
          {
            p: 'Hesap silme hassas ve kesin bir işlemdir; bu nedenle bir silme talebi kabul edilmeden önce önce oturum açmanızı, ek bir onay olarak geçerli parolanızı yeniden girmenizi (yalnızca e-posta/parola hesapları için) ve açık bir onay sözcüğü yazmanızı isteriz.'
          }
        ]
      },
      {
        heading: 'Oturum açamıyor musunuz?',
        blocks: [
          {
            p: 'Hesabınıza erişemiyorsanız (örneğin parolanıza veya telefon numaranıza erişiminizi kaybettiniz) ve hesabınızın ve verilerinizin silinmesini talep etmek istiyorsanız, hesabınıza kayıtlı e-posta adresinden [support@hudhudnest.com](mailto:support@hudhudnest.com?subject=Hesap%20silme%20talebi) adresine talebinizi açıklayan bir e-posta yazın. Silmeyi elle gerçekleştirmeden önce kimliğinizi doğrularız.'
          }
        ]
      },
      {
        heading: 'Gizlilik politikası',
        blocks: [
          {
            p: 'Topladığımız veriler ve ne kadar süre sakladığımız hakkında daha fazla bilgi için [Gizlilik Politikası](/privacy-policy)\'na bakın.'
          }
        ]
      }
    ],
    back: 'Ana sayfaya dön'
  }
};
