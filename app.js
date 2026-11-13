/* FoodWise stores authenticated inventory and history in Supabase. */
(() => {
  'use strict';
  const ITEM_COLUMNS='id,user_id,legacy_id,name,category,quantity,unit,purchase_date,expiry_date,price,updated_at,created_at';
  const HISTORY_COLUMNS='id,user_id,food_item_id,legacy_item_id,legacy_record_id,outcome,recorded_at,recorded_date,item_name,item_category,item_quantity,item_unit,item_purchase_date,item_expiry_date,item_price,item_updated_at';
  const CATEGORIES = ['Fruits', 'Vegetables', 'Meat & Seafood', 'Dairy', 'Beverages', 'Frozen Food', 'Noodles & Pasta', 'Snacks', 'Other'];
  const LANGUAGE_STORAGE_KEY='foodwise-language-v1';
  const ICONS = { Fruits:'🍊', Vegetables:'🥬', 'Meat & Seafood':'🐟', Dairy:'🥛', Beverages:'🧃', 'Frozen Food':'🧊', 'Noodles & Pasta':'🍜', Snacks:'🥨', Other:'🍽️' };
  const $ = (id) => document.getElementById(id);
  const EMAIL_CONFIRMATION_REDIRECT='https://kanthinan.github.io/foodwise/';
  function hasSupabaseAuthCallback() {
    const fragment=new URLSearchParams(location.hash.slice(1)),query=new URLSearchParams(location.search);
    return fragment.has('access_token')||fragment.has('refresh_token')||fragment.has('error')||fragment.has('error_code')||query.has('code')||query.has('error');
  }
  let authCallbackPending=hasSupabaseAuthCallback();
  const dateInput = (date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const todayKey = () => dateInput(new Date());
  const parseLocalDate = (value) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null; const [y,m,d] = value.split('-').map(Number); const date = new Date(y,m-1,d); return date.getFullYear()===y && date.getMonth()===m-1 && date.getDate()===d ? date : null; };
  const daysUntil = (value) => { const target=parseLocalDate(value), today=parseLocalDate(todayKey()); if(!target||!today)return null; return Math.round((target-today)/86400000); };
  const expiryStatus = (item) => { const days=daysUntil(item.expiryDate); return days===null ? 'expired' : days<0 ? 'expired' : days<=3 ? 'soon' : 'fresh'; };
  const statusText = (item) => { const days=daysUntil(item.expiryDate); if(days===0)return t('Due Today'); if(days<0)return t(Math.abs(days)===1?'{days} day overdue':'{days} days overdue',{days:Math.abs(days)}); if(days===1)return t('1 day left'); return t('{days} days left',{days}); };
  const formatDate = (value) => { const d=parseLocalDate(value); return d ? new Intl.DateTimeFormat(currentLanguage==='th'?'th-TH':'en-US',{day:'numeric',month:'short',year:'numeric'}).format(d) : '—'; };
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const foldSearchText = (value) => String(value ?? '').normalize('NFC').toLowerCase();
  const THAI_TRANSLATIONS={
    'Dashboard':'แดชบอร์ด','My inventory':'คลังอาหารของฉัน','Use it first':'ควรใช้ก่อน','Waste summary':'สรุปอาหารที่ทิ้ง',
    'Sign out':'ออกจากระบบ','Add food':'เพิ่มอาหาร','Good morning':'สวัสดีตอนเช้า','A little planning today means less waste tomorrow.':'วางแผนวันนี้ ลดอาหารเหลือทิ้งในวันหน้า',
    'Load demo data':'เพิ่มข้อมูลตัวอย่าง','Active items':'รายการอาหาร','in your kitchen':'ในครัวของคุณ','Expiring soon':'ใกล้หมดอายุ','use in the next 3 days':'ควรใช้ภายใน 3 วัน','Expired':'หมดอายุแล้ว','need your attention':'ต้องจัดการ','Consumed':'ใช้แล้ว','items enjoyed so far':'รายการที่ใช้แล้ว',
    "Don't let it go to waste":'อย่าปล่อยให้อาหารเสีย','Needs your attention':'รายการที่ควรจัดการ','See all':'ดูทั้งหมด','A fresh start':'เริ่มต้นใหม่','What’s in your kitchen today?':'วันนี้ในครัวมีอะไรบ้าง?','Add what you have on hand and we’ll help you keep track.':'เพิ่มรายการอาหาร แล้วเราจะช่วยติดตามให้','Add your first item':'เพิ่มรายการแรก','Eat before it expires. Save food. Save money.':'กินก่อนหมดอายุ ลดอาหารเหลือทิ้ง ประหยัดเงิน','FoodWise helps you make the most of every ingredient.':'FoodWise ช่วยให้คุณใช้วัตถุดิบทุกอย่างได้คุ้มค่า',
    'Everything you have, all in one place.':'รวมอาหารทั้งหมดของคุณไว้ในที่เดียว','Search food':'ค้นหาอาหาร','All categories':'ทุกหมวดหมู่','All statuses':'ทุกสถานะ','Fresh':'สดใหม่','Name A–Z':'ชื่อตามลำดับ A–Z','Soonest expiry':'หมดอายุเร็วที่สุด','Latest expiry':'หมดอายุช้าที่สุด','Food':'อาหาร','Quantity':'จำนวน','Category':'หมวดหมู่','Expires':'วันหมดอายุ','Status':'สถานะ','Actions':'การดำเนินการ','Bought':'ซื้อเมื่อ','Waste':'ทิ้ง','Edit':'แก้ไข','Delete':'ลบ',
    'Your soonest-expiring ingredients, right at the top.':'รายการใกล้หมดอายุจะแสดงไว้ด้านบน','Due Today':'ครบกำหนดวันนี้','{days} day overdue':'เลยกำหนด {days} วัน','{days} days overdue':'เลยกำหนด {days} วัน','1 day left':'เหลือ 1 วัน','{days} days left':'เหลือ {days} วัน','expires':'หมดอายุ','Mark consumed':'ทำเครื่องหมายว่าใช้แล้ว',
    'Every meal made and ingredient saved tells a story.':'ทุกมื้อและวัตถุดิบที่ช่วยรักษามีเรื่องราว','A quick look':'ภาพรวม','Consumed vs. wasted':'ใช้แล้วเทียบกับทิ้ง','Estimated waste value':'มูลค่าอาหารที่ทิ้งโดยประมาณ','Based on purchase prices you’ve recorded for wasted items.':'คำนวณจากราคาซื้อที่บันทึกไว้สำหรับอาหารที่ทิ้ง','Every little bit counts.':'ทุกความพยายามมีความหมาย','The full story':'รายละเอียดทั้งหมด','Item history':'ประวัติอาหาร',
    'Make it count':'ทุกอย่างมีความหมาย','Keep your kitchen in the know.':'ติดตามอาหารในครัวของคุณ','Food name':'ชื่ออาหาร','Unit':'หน่วย','Choose unit':'เลือกหน่วย','pcs':'ชิ้น','kg':'กก.','g':'ก.','L':'ลิตร','ml':'มล.','packs':'แพ็ก','bunches':'กำ','boxes':'กล่อง','servings':'ที่','bag':'ถุง','cups':'ถ้วย','box':'กล่อง','pack':'แพ็ก','Expires on':'วันหมดอายุ','Purchase date':'วันที่ซื้อ','optional':'ไม่บังคับ','Purchase price':'ราคาซื้อ','Cancel':'ยกเลิก','Add to inventory':'เพิ่มในคลังอาหาร','Edit food':'แก้ไขอาหาร','Save changes':'บันทึกการแก้ไข',
    'Email address':'อีเมล','Password':'รหัสผ่าน','Welcome back':'ยินดีต้อนรับกลับ','Sign in to continue to FoodWise.':'เข้าสู่ระบบเพื่อใช้งาน FoodWise ต่อ','Sign in':'เข้าสู่ระบบ','Create your account':'สร้างบัญชีของคุณ','Start keeping track of your kitchen.':'เริ่มติดตามอาหารในครัวของคุณ','Create account':'สร้างบัญชี','Already have an account?':'มีบัญชีอยู่แล้ว?','New to FoodWise?':'เพิ่งใช้ FoodWise?','Create an account':'สร้างบัญชี','Need another confirmation email?':'ต้องการอีเมลยืนยันอีกครั้ง?','Resend confirmation email':'ส่งอีเมลยืนยันอีกครั้ง','Phone sign-in is disabled until SMS setup is complete.':'ยังไม่เปิดใช้การเข้าสู่ระบบด้วยโทรศัพท์จนกว่าจะตั้งค่า SMS เสร็จ',
    'Checking your session…':'กำลังตรวจสอบเซสชัน','Try Again':'ลองอีกครั้ง','Retry loading data':'ลองโหลดข้อมูลอีกครั้ง','Sending…':'กำลังส่ง…','Signing out…':'กำลังออกจากระบบ…','Refreshing your FoodWise data…':'กำลังโหลดข้อมูล FoodWise ใหม่…','Verifying your account and loading your food data…':'กำลังตรวจสอบบัญชีและโหลดข้อมูลอาหาร…',
    'Looking good!':'ดีมาก!','Nothing needs your attention right now.':'ตอนนี้ไม่มีรายการที่ต้องจัดการ','No matching food':'ไม่พบอาหารที่ตรงกัน','Your inventory is ready for a fresh start':'คลังอาหารของคุณพร้อมเริ่มต้น','Try a different search or filter.':'ลองเปลี่ยนคำค้นหาหรือตัวกรอง','Add what you have at home and FoodWise will help you keep track.':'เพิ่มอาหารที่มีอยู่ แล้ว FoodWise จะช่วยติดตามให้','Nothing on the shelf yet':'ยังไม่มีอาหารในรายการ','Add food to see what you should use first.':'เพิ่มอาหารเพื่อดูว่าควรใช้รายการใดก่อน','Your story starts here':'เรื่องราวของคุณเริ่มที่นี่','Mark food as consumed or wasted to build your summary.':'ทำเครื่องหมายว่าใช้แล้วหรือทิ้ง เพื่อสร้างสรุปของคุณ','No history yet':'ยังไม่มีประวัติ','Consumed and wasted items will appear here.':'รายการที่ใช้แล้วและทิ้งจะแสดงที่นี่',
    'Please enter a food name.':'กรอกชื่ออาหาร','Choose a category.':'เลือกหมวดหมู่','Quantity must be greater than zero.':'จำนวนต้องมากกว่าศูนย์','Choose a unit.':'เลือกหน่วย','Enter a valid expiration date.':'กรอกวันหมดอายุที่ถูกต้อง','Enter a valid purchase date.':'กรอกวันที่ซื้อที่ถูกต้อง','Price must be zero or more.':'ราคาต้องเป็นศูนย์หรือมากกว่า','Enter a valid email address.':'กรอกอีเมลที่ถูกต้อง','Enter your password.':'กรอกรหัสผ่าน','Enter the email address you used to register.':'กรอกอีเมลที่ใช้ลงทะเบียน',
    'Added to your inventory.':'เพิ่มอาหารในคลังแล้ว','Food item updated.':'อัปเดตรายการอาหารแล้ว','Food item deleted.':'ลบรายการอาหารแล้ว','Choose a valid food outcome.':'เลือกสถานะอาหารที่ถูกต้อง','Account created. Opening FoodWise…':'สร้างบัญชีแล้ว กำลังเปิด FoodWise…','Check your email for the confirmation link, then return here to sign in.':'ตรวจสอบอีเมลเพื่อยืนยัน แล้วกลับมาเข้าสู่ระบบ','Signed in. Opening FoodWise…':'เข้าสู่ระบบแล้ว กำลังเปิด FoodWise…','Confirmation email requested':'ส่งคำขออีเมลยืนยันแล้ว','Too many confirmation requests. Please wait a few minutes before trying again.':'ส่งคำขอยืนยันบ่อยเกินไป กรุณารอสักครู่ก่อนลองอีกครั้ง','Your account inventory and history have been reset.':'รีเซ็ตคลังอาหารและประวัติของบัญชีแล้ว','Demo items added to your account.':'เพิ่มรายการตัวอย่างในบัญชีแล้ว',
    'Could not load your cloud data.':'โหลดข้อมูลบนคลาวด์ไม่สำเร็จ','Could not add this food item.':'เพิ่มอาหารไม่สำเร็จ','Could not save this food item.':'บันทึกอาหารไม่สำเร็จ','Could not delete this food item.':'ลบอาหารไม่สำเร็จ','Could not restore your session. Check your connection and try again.':'กู้คืนเซสชันไม่สำเร็จ ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง','Could not sign out. Please try again.':'ออกจากระบบไม่สำเร็จ โปรดลองอีกครั้ง','Your session has expired. Please sign in again.':'เซสชันหมดอายุแล้ว กรุณาเข้าสู่ระบบอีกครั้ง','Your session has ended. Please sign in again.':'เซสชันสิ้นสุดแล้ว กรุณาเข้าสู่ระบบอีกครั้ง','Could not confirm your session. Sign in again.':'ยืนยันเซสชันไม่สำเร็จ กรุณาเข้าสู่ระบบอีกครั้ง','FoodWise is still loading your account data. Please try again.':'FoodWise กำลังโหลดข้อมูลบัญชี โปรดลองอีกครั้ง','The change was saved, but FoodWise could not refresh your data. Retry the cloud load.':'บันทึกแล้ว แต่โหลดข้อมูลใหม่ไม่สำเร็จ โปรดลองอีกครั้ง','An error occurred. Please try again.':'เกิดข้อผิดพลาด โปรดลองอีกครั้ง','Please check your connection and try again.':'ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง','Your session could not be verified. Please sign in again.':'ยืนยันเซสชันไม่สำเร็จ กรุณาเข้าสู่ระบบอีกครั้ง',
    'Fruits':'ผลไม้','Vegetables':'ผัก','Meat & Seafood':'เนื้อสัตว์และอาหารทะเล','Dairy':'ผลิตภัณฑ์นม','Beverages':'เครื่องดื่ม','Frozen Food':'อาหารแช่แข็ง','Noodles & Pasta':'บะหมี่และอาหารประเภทเส้น','Snacks':'ขนมขบเคี้ยว','Other':'อื่น ๆ',
    'Wasted':'ทิ้งแล้ว','items':'รายการ','Language':'ภาษา','Language preference could not be saved.':'บันทึกภาษาที่เลือกไม่สำเร็จ','Eat before it expires':'กินก่อนหมดอายุ',
    'YOUR KITCHEN, YOURS':'ครัวของคุณ','FoodWise dashboard':'แดชบอร์ด FoodWise','Main navigation':'เมนูหลัก','A little less waste goes a long way.':'ลดอาหารเหลือทิ้งทีละน้อย ก็ช่วยโลกได้มาก','Small choices in your kitchen add up to a better planet.':'การเลือกเล็ก ๆ ในครัวช่วยให้โลกดีขึ้น','Made for mindful kitchens':'สร้างสรรค์เพื่อครัวที่ใส่ใจ','Your previous browser inventory remains untouched. It is not loaded into this account; local data migration is not available in this phase.':'ข้อมูลอาหารเดิมในเบราว์เซอร์ยังคงอยู่ ข้อมูลนี้ไม่ได้ถูกโหลดเข้าบัญชี และยังไม่มีการย้ายข้อมูลในระยะนี้','Inventory overview':'ภาพรวมคลังอาหาร','Filter by category':'กรองตามหมวดหมู่','Filter by status':'กรองตามสถานะ','Sort inventory':'เรียงคลังอาหาร','Reset all data':'รีเซ็ตข้อมูลทั้งหมด','Close':'ปิด','e.g. Avocados':'เช่น อะโวคาโด','e.g. 3':'เช่น 3','e.g. 89':'เช่น 89',
    '{name} marked as {outcome}.':'ทำเครื่องหมาย {name} ว่า{outcome}','FoodWise':'FoodWise',
    'You are about to permanently delete {name} from your cloud inventory. This will not add it to history.':'คุณกำลังจะลบ {name} ออกจากคลังบนคลาวด์อย่างถาวร รายการนี้จะไม่ถูกเพิ่มในประวัติ',
    'Add the FoodWise demo items to this signed-in account in Supabase? These sample records will be visible in your cloud inventory.':'เพิ่มข้อมูลตัวอย่าง FoodWise ในบัญชี Supabase ที่เข้าสู่ระบบอยู่หรือไม่ รายการตัวอย่างจะปรากฏในคลังอาหารบนคลาวด์',
    'Permanently delete all food inventory and history from this signed-in account in Supabase? This cannot be undone.':'ลบคลังอาหารและประวัติทั้งหมดจากบัญชี Supabase นี้อย่างถาวรหรือไม่ การดำเนินการนี้ไม่สามารถย้อนกลับได้',
    'FoodWise could not finish checking your session within 15 seconds. Check your connection and try again.':'FoodWise ตรวจสอบเซสชันไม่สำเร็จภายใน 15 วินาที ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง',
    'Could not load your account data. Please try again.':'โหลดข้อมูลบัญชีไม่สำเร็จ โปรดลองอีกครั้ง','The item was not found in your account. Refresh and try again.':'ไม่พบรายการนี้ในบัญชีของคุณ โหลดข้อมูลใหม่แล้วลองอีกครั้ง',
    'Configuration error':'การตั้งค่ามีข้อผิดพลาด','Add your Supabase Project URL and Publishable key to supabase-config.js to enable email authentication.':'เพิ่ม Supabase Project URL และ Publishable key ใน supabase-config.js เพื่อเปิดใช้การยืนยันตัวตนทางอีเมล',
    'The Supabase JavaScript client could not load. Check your connection and reload the page.':'โหลดไคลเอนต์ Supabase ไม่สำเร็จ ตรวจสอบการเชื่อมต่อแล้วโหลดหน้าใหม่','FoodWise could not initialize Supabase authentication. Check supabase-config.js.':'เริ่มการยืนยันตัวตน Supabase ไม่สำเร็จ ตรวจสอบ supabase-config.js',
    'Your email or password was not accepted. Check your details and try again.':'อีเมลหรือรหัสผ่านไม่ถูกต้อง ตรวจสอบข้อมูลแล้วลองอีกครั้ง','Could not resend the confirmation email. Check your connection and try again.':'ส่งอีเมลยืนยันไม่สำเร็จ ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง',
    'Confirmation email requested for {email}. Check your inbox and spam folder.':'ส่งคำขออีเมลยืนยันไปยัง {email} แล้ว ตรวจสอบกล่องจดหมายและสแปม',
    'Invalid login credentials':'อีเมลหรือรหัสผ่านไม่ถูกต้อง','Email not confirmed':'กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ',
    'YOUR KITCHEN, AT A GLANCE':'ครัวของคุณในภาพรวม','DON\'T LET IT GO TO WASTE':'อย่าปล่อยให้อาหารเสีย','A FRESH START':'เริ่มต้นใหม่','YOUR KITCHEN':'ครัวของคุณ','A LITTLE HEAD START':'เริ่มจัดการก่อน','YOUR FOOD JOURNEY':'เส้นทางอาหารของคุณ','A QUICK LOOK':'ภาพรวม','ESTIMATED WASTE VALUE':'มูลค่าอาหารที่ทิ้งโดยประมาณ','THE FULL STORY':'รายละเอียดทั้งหมด','MAKE IT COUNT':'ทุกอย่างมีความหมาย','WORKSPACE':'เมนูหลัก','Settings':'ตั้งค่า'
  };
  let currentLanguage='en';
  function t(key,values={}) { let text=currentLanguage==='th'?(THAI_TRANSLATIONS[key]||key):key; return text.replace(/\{(\w+)\}/g,(_,name)=>String(values[name]??'')); }
  function categoryLabel(category) { return escapeHtml(t(category)); }
  function localizeMessage(message) {
    if(currentLanguage==='en')return message;
    if(THAI_TRANSLATIONS[message])return t(message);
    const emailRequest=message.match(/^Confirmation email requested for (.+)\. Check your inbox and spam folder\.$/);
    if(emailRequest)return t('Confirmation email requested for {email}. Check your inbox and spam folder.',{email:emailRequest[1]});
    const outcome=message.match(/^(.+) marked as (consumed|wasted)\.$/);
    if(outcome)return t('{name} marked as {outcome}.',{name:outcome[1],outcome:t(outcome[2]==='consumed'?'Consumed':'Wasted')});
    if(/rate.?limit|too many requests|security purposes/i.test(message))return t('Too many confirmation requests. Please wait a few minutes before trying again.');
    return t('An error occurred. Please try again.');
  }
  function setLocalizedText(element,key,kind='text') { element.dataset.i18nText=key; element.dataset.i18nKind=kind; element.textContent=kind==='message'?localizeMessage(key):t(key); }
  function readLanguage() { try { const saved=localStorage.getItem(LANGUAGE_STORAGE_KEY); return saved==='th'?'th':'en'; } catch { return 'en'; } }
  function applyLanguage() {
    document.documentElement.lang=currentLanguage;
    document.querySelectorAll('[data-i18n]').forEach(el=>{el.textContent=t(el.dataset.i18n);});
    document.querySelectorAll('[data-i18n-button]').forEach(el=>{el.innerHTML=`${escapeHtml(t(el.dataset.i18nButton))} <span>→</span>`;});
    document.querySelectorAll('[data-i18n-html]').forEach(el=>{el.textContent=t(el.dataset.i18nHtml);});
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{el.placeholder=t(el.dataset.i18nPlaceholder);});
    document.querySelectorAll('[data-i18n-aria-label]').forEach(el=>{el.setAttribute('aria-label',t(el.dataset.i18nAriaLabel));});
    document.querySelectorAll('[data-i18n-text]').forEach(el=>{el.textContent=el.dataset.i18nKind==='message'?localizeMessage(el.dataset.i18nText):t(el.dataset.i18nText);});
    document.querySelectorAll('.language-switcher').forEach(select=>{select.value=currentLanguage;select.setAttribute('aria-label',t('Language'));});
    document.querySelectorAll('#food-category option, #category-filter option').forEach(option=>{if(CATEGORIES.includes(option.value))option.textContent=t(option.value);});
    document.title=`FoodWise — ${t('Eat before it expires')}`;
    $('today-label').textContent=new Intl.DateTimeFormat(currentLanguage==='th'?'th-TH':'en-US',{weekday:'long',month:'long',day:'numeric'}).format(new Date());
  }
  function setLanguage(language,persist=true) {
    currentLanguage=language==='th'?'th':'en';
    if(persist){try{localStorage.setItem(LANGUAGE_STORAGE_KEY,currentLanguage);}catch{showToast(t('Language preference could not be saved.'),'error');}}
    applyLanguage();
    render();
  }
  const money = (amount) => new Intl.NumberFormat(currentLanguage==='th'?'th-TH':'en-US',{style:'currency',currency:'THB',maximumFractionDigits:2}).format(amount || 0);
  const makeId = () => globalThis.crypto?.randomUUID ? crypto.randomUUID() : `fw-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let data={active:[],history:[]};
  let supabaseClient=null;
  let currentUserId=null;
  let dataState='signed_out';
  let authGeneration=0;
  let startedLoadGeneration=-1;
  let authMode='signin';
  let authEventVersion=0;
  let authInitializationAttempt=0;
  let authInitializationPending=false;
  let authInitializationTimer=null;
  let authListenerRegistered=false;
  let retryAction=null;
  const AUTH_INITIALIZATION_TIMEOUT_MS=15000;
  function mapItem(row) { return {id:String(row.id),name:row.name,category:row.category,quantity:Number(row.quantity),unit:row.unit,purchaseDate:row.purchase_date||'',expiryDate:row.expiry_date,price:row.price==null?'':Number(row.price),status:expiryStatus({expiryDate:row.expiry_date}),updatedAt:row.updated_at||''}; }
  function mapHistory(row) { const expiryDate=row.item_expiry_date||''; return {item:{id:row.legacy_item_id||String(row.food_item_id??row.id),name:row.item_name,category:row.item_category,quantity:Number(row.item_quantity),unit:row.item_unit,purchaseDate:row.item_purchase_date||'',expiryDate,price:row.item_price==null?'':Number(row.item_price),status:expiryStatus({expiryDate}),updatedAt:row.item_updated_at||''},outcome:row.outcome,recordedAt:row.recorded_at,recordedDate:row.recorded_date}; }
  function itemPayload(values) { return {name:values.name,category:values.category,quantity:Number(values.quantity),unit:values.unit,purchase_date:values.purchaseDate||null,expiry_date:values.expiryDate,price:values.price===''?null:Number(values.price),updated_at:new Date().toISOString()}; }
  function showCloudStatus(message,{loading=false,retry=false}={}) { showAuthState({loading,configurationError:true,error:loading?'':message,loadingMessage:message,retryAction:retry?'cloud':null}); }
  function currentRequest(userId,generation) { return currentUserId===userId&&authGeneration===generation; }
  async function loadUserRows(table,columns,userId,orderColumn,ascending) {
    const rows=[],pageSize=500;
    for(let start=0;;start+=pageSize) {
      const {data:page,error}=await supabaseClient.from(table).select(columns).eq('user_id',userId).order(orderColumn,{ascending}).order('id',{ascending:true}).range(start,start+pageSize-1);
      if(error)throw error;
      rows.push(...(page||[]));
      if(!page||page.length<pageSize)return rows;
    }
  }
  async function fetchAccountData(userId,generation) {
    const {data:userData,error:userError}=await supabaseClient.auth.getUser();
    if(userError)throw userError;
    if(!userData.user||userData.user.id!==userId)throw new Error('Your session could not be verified. Please sign in again.');
    const [itemRows,historyRows]=await Promise.all([
      loadUserRows('food_items',ITEM_COLUMNS,userId,'expiry_date',true),
      loadUserRows('food_history',HISTORY_COLUMNS,userId,'recorded_at',false)
    ]);
    if(!currentRequest(userId,generation))return false;
    data={active:itemRows.map(mapItem),history:historyRows.map(mapHistory)};
    dataState='ready';
    $('local-data-notice').hidden=false;
    $('auth-screen').hidden=true;
    document.querySelector('.app-shell').hidden=false;
    $('auth-user-label').textContent=userData.user.email||'';
    render();
    return true;
  }
  async function refreshAccountData(userId=currentUserId,generation=authGeneration) {
    if(!userId||!currentRequest(userId,generation))return false;
    dataState='loading';
    showCloudStatus('Refreshing your FoodWise data…',{loading:true});
    try { return await fetchAccountData(userId,generation); }
    catch(error) { if(currentRequest(userId,generation)){data={active:[],history:[]};dataState='error';showCloudStatus(`Could not load your cloud data: ${error?.message||'Please try again.'}`,{error:true,retry:true});} return false; }
  }
  async function writeSucceededRefresh(userId,generation,successMessage) { const refreshed=await refreshAccountData(userId,generation); if(refreshed&&successMessage)showToast(successMessage); else if(currentRequest(userId,generation))showToast('The change was saved, but FoodWise could not refresh your data. Retry the cloud load.','error'); }
  async function handleExpiredSession(error) {
    if(error?.status!==401&&!/jwt expired|invalid.*token|token.*expired/i.test(error?.message||''))return false;
    authGeneration++; startedLoadGeneration=-1; currentUserId=null; data={active:[],history:[]}; dataState='signed_out';
    showAuthState({error:'Your session has expired. Please sign in again.'});
    try { await supabaseClient.auth.signOut({scope:'local'}); } catch {}
    return true;
  }
  async function showDataError(error,fallback) { if(await handleExpiredSession(error))return; showToast(error?.message||fallback,'error'); }
  function showToast(message,type='success') { const toast=document.createElement('div'); toast.className=`toast ${type==='error'?'error':''}`; setLocalizedText(toast,message,'message'); $('toast-region').append(toast); setTimeout(()=>toast.remove(),4200); }
  function statusPill(item) { const status=expiryStatus(item),label=status==='fresh'?t('Fresh'):status==='soon'?statusText(item):t('Expired'); return `<span class="status-pill status-${status}">${escapeHtml(label)}</span>`; }
  function itemIcon(item) { return ICONS[item.category] || '🍽️'; }
  function sortItems(items) { const mode=$('sort-select').value; return [...items].sort((a,b)=>mode==='name-asc'?a.name.localeCompare(b.name):mode==='expiry-desc'?b.expiryDate.localeCompare(a.expiryDate):a.expiryDate.localeCompare(b.expiryDate)); }
  function emptyState(title,description,button=false) { return `<div class="empty-state"><div class="empty-illustration">✿</div><h3>${escapeHtml(t(title))}</h3><p>${escapeHtml(t(description))}</p>${button?`<button class="button button-primary" data-action="add">＋ ${escapeHtml(t('Add food'))}</button>`:''}</div>`; }
  function renderDashboard() {
    const active=data.active, statuses=active.map(expiryStatus), attention=active.filter(x=>expiryStatus(x)!=='fresh').sort((a,b)=>a.expiryDate.localeCompare(b.expiryDate));
    $('stat-active').textContent=active.length; $('stat-soon').textContent=statuses.filter(x=>x==='soon').length; $('stat-expired').textContent=statuses.filter(x=>x==='expired').length; $('stat-consumed').textContent=data.history.filter(x=>x.outcome==='consumed').length; $('nav-count').textContent=active.length; $('attention-count').textContent=attention.length;
    $('attention-list').innerHTML=attention.length?attention.slice(0,4).map(item=>`<div class="attention-row"><div class="food-avatar">${itemIcon(item)}</div><div class="food-main"><div class="food-name">${escapeHtml(item.name)}</div><div class="food-meta">${escapeHtml(item.quantity)} ${escapeHtml(t(item.unit))} · ${categoryLabel(item.category)}</div></div><span class="attention-days ${expiryStatus(item)==='expired'?'expired':''}">${escapeHtml(statusText(item))}</span><div class="row-actions"><button class="icon-button" data-action="consumed" data-id="${escapeHtml(item.id)}" title="${escapeHtml(t('Mark consumed'))}">✓</button></div></div>`).join(''):emptyState('Looking good!','Nothing needs your attention right now.');
  }
  function renderInventory() {
    const q=foldSearchText($('search-input').value.trim()), cat=$('category-filter').value, stat=$('status-filter').value;
    const items=sortItems(data.active.filter(item=>(!q||foldSearchText(item.name).includes(q)||foldSearchText(item.category).includes(q)||foldSearchText(THAI_TRANSLATIONS[item.category]||'').includes(q))&&(!cat||item.category===cat)&&(!stat||expiryStatus(item)===stat)));
    $('inventory-list').innerHTML=items.length?`<table class="inventory-table"><thead><tr><th>${t('Food')}</th><th>${t('Quantity')}</th><th>${t('Category')}</th><th>${t('Expires')}</th><th>${t('Status')}</th><th><span class="sr-only">${t('Actions')}</span></th></tr></thead><tbody>${items.map(item=>`<tr><td><div class="item-cell"><div class="food-avatar">${itemIcon(item)}</div><div><div class="food-name">${escapeHtml(item.name)}</div><div class="food-meta">${item.purchaseDate?`${t('Bought')} ${formatDate(item.purchaseDate)}`:''}</div></div></div></td><td data-label="${escapeHtml(t('Quantity'))}">${escapeHtml(item.quantity)} ${escapeHtml(t(item.unit))}</td><td>${categoryLabel(item.category)}</td><td data-label="${escapeHtml(t('Expires'))}">${formatDate(item.expiryDate)}</td><td>${statusPill(item)}</td><td><div class="table-actions"><button class="icon-button" data-action="consumed" data-id="${escapeHtml(item.id)}" title="${escapeHtml(t('Mark consumed'))}">✓</button><button class="icon-button" data-action="wasted" data-id="${escapeHtml(item.id)}" title="${escapeHtml(t('Waste'))}">${t('Waste')}</button><button class="icon-button" data-action="edit" data-id="${escapeHtml(item.id)}" title="${escapeHtml(t('Edit'))}">${t('Edit')}</button><button class="icon-button" data-action="delete" data-id="${escapeHtml(item.id)}" title="${escapeHtml(t('Delete'))}">×</button></div></td></tr>`).join('')}</tbody></table>`:emptyState(data.active.length?'No matching food':'Your inventory is ready for a fresh start',data.active.length?'Try a different search or filter.':'Add what you have at home and FoodWise will help you keep track.',!data.active.length);
  }
  function renderUseFirst() { const items=[...data.active].sort((a,b)=>a.expiryDate.localeCompare(b.expiryDate)); $('use-first-list').innerHTML=items.length?items.map(item=>`<article class="use-card"><div class="food-avatar">${itemIcon(item)}</div><div class="food-main"><div class="food-name">${escapeHtml(item.name)}</div><div class="food-meta">${escapeHtml(item.quantity)} ${escapeHtml(t(item.unit))} · ${categoryLabel(item.category)}</div><div class="use-date">${escapeHtml(statusText(item))} · ${t('expires')} ${formatDate(item.expiryDate)}</div><button class="icon-button" data-action="consumed" data-id="${escapeHtml(item.id)}">✓ ${t('Mark consumed')}</button></div>${statusPill(item)}</article>`).join(''):emptyState('Nothing on the shelf yet','Add food to see what you should use first.',true); }
  function renderHistory() {
    const consumed=data.history.filter(x=>x.outcome==='consumed'), wasted=data.history.filter(x=>x.outcome==='wasted'), total=consumed.length+wasted.length, angle=total?Math.round(consumed.length/total*360):0, value=wasted.reduce((sum,x)=>sum+(Number(x.item.price)||0),0);
    $('chart-area').innerHTML=total?`<div class="donut" style="--consumed-angle:${angle}deg"><div class="donut-center">${total}<small>${t('items')}</small></div></div><div class="chart-legend"><div class="legend-row"><span class="legend-label"><i class="legend-dot"></i> ${t('Consumed')}</span><strong>${consumed.length}</strong></div><div class="legend-row"><span class="legend-label"><i class="legend-dot wasted"></i> ${t('Wasted')}</span><strong>${wasted.length}</strong></div></div>`:emptyState('Your story starts here','Mark food as consumed or wasted to build your summary.');
    $('waste-value').textContent=money(value); const rows=[...data.history].sort((a,b)=>String(b.recordedAt).localeCompare(String(a.recordedAt)));
    $('history-list').innerHTML=rows.length?rows.map(x=>`<div class="history-row"><div class="food-avatar">${itemIcon(x.item)}</div><div class="food-main"><div class="food-name">${escapeHtml(x.item.name)}</div><div class="food-meta">${escapeHtml(x.item.quantity)} ${escapeHtml(t(x.item.unit))} · ${categoryLabel(x.item.category)}</div></div><span class="history-badge ${x.outcome}">${x.outcome==='consumed'?`✓ ${t('Consumed')}`:t('Wasted')}</span><span class="history-date">${formatDate(x.recordedDate)}</span></div>`).join(''):emptyState('No history yet','Consumed and wasted items will appear here.');
  }
  function render() { renderDashboard(); renderInventory(); renderUseFirst(); renderHistory(); }
  function navigate(page) { const target=$(`page-${page}`); if(!target)return; document.querySelectorAll('.page').forEach(el=>el.classList.remove('active')); target.classList.add('active'); document.querySelectorAll('.nav-link').forEach(el=>el.classList.toggle('active',el.dataset.page===page)); if(!authCallbackPending&&location.hash!==`#${page}`)history.replaceState(null,'',`#${page}`); window.scrollTo(0,0); }
  function openModal(item) { const form=$('item-form'); form.reset(); document.querySelectorAll('.field').forEach(x=>x.classList.remove('invalid')); document.querySelectorAll('.field-error').forEach(e=>{e.textContent='';delete e.dataset.i18nText;delete e.dataset.i18nKind;}); $('item-id').value=item?.id||''; $('modal-title').dataset.i18n=item?'Edit food':'Add food'; $('modal-title').textContent=t($('modal-title').dataset.i18n); $('save-item').dataset.i18nButton=item?'Save changes':'Add to inventory'; $('save-item').innerHTML=`${escapeHtml(t($('save-item').dataset.i18nButton))} <span>→</span>`; if(item){$('food-name').value=item.name;$('food-category').value=item.category;$('food-quantity').value=item.quantity;$('food-unit').value=item.unit;$('food-expiry').value=item.expiryDate;$('food-purchase-date').value=item.purchaseDate||'';$('food-price').value=item.price??'';} $('item-modal').classList.add('open'); $('item-modal').setAttribute('aria-hidden','false'); setTimeout(()=>$('food-name').focus(),50); }
  function closeModal(){ $('item-modal').classList.remove('open'); $('item-modal').setAttribute('aria-hidden','true'); }
  function validateForm() { const values={name:$('food-name').value,category:$('food-category').value,quantity:$('food-quantity').value,unit:$('food-unit').value,expiryDate:$('food-expiry').value,purchaseDate:$('food-purchase-date').value,price:$('food-price').value}; const errors={}; if(!values.name.trim())errors.name='Please enter a food name.'; if(!CATEGORIES.includes(values.category))errors.category='Choose a category.'; if(!Number.isFinite(Number(values.quantity))||Number(values.quantity)<=0)errors.quantity='Quantity must be greater than zero.'; if(!values.unit)errors.unit='Choose a unit.'; if(!parseLocalDate(values.expiryDate))errors.expiryDate='Enter a valid expiration date.'; if(values.purchaseDate&&!parseLocalDate(values.purchaseDate))errors.purchaseDate='Enter a valid purchase date.'; if(values.price!==''&&(!Number.isFinite(Number(values.price))||Number(values.price)<0))errors.price='Price must be zero or more.'; document.querySelectorAll('.field').forEach(f=>f.classList.remove('invalid')); document.querySelectorAll('.field-error').forEach(e=>{e.textContent='';delete e.dataset.i18nText;delete e.dataset.i18nKind;}); Object.entries(errors).forEach(([key,message])=>{const input=document.querySelector(`[name="${key}"]`); if(input){input.closest('.field').classList.add('invalid'); const err=document.querySelector(`[data-error="${key}"]`); if(err)setLocalizedText(err,message);}}); return Object.keys(errors).length?null:values; }
  async function addOrUpdate(values) {
    if(dataState!=='ready'||!currentUserId){showToast('FoodWise is still loading your account data. Please try again.','error');return;}
    const userId=currentUserId,generation=authGeneration,id=$('item-id').value,payload=itemPayload(values);
    try {
      const result=id
        ? await supabaseClient.from('food_items').update(payload).eq('id',id).eq('user_id',userId).select(ITEM_COLUMNS).single()
        : await supabaseClient.from('food_items').insert({...payload,user_id:userId}).select(ITEM_COLUMNS).single();
      if(result.error)throw result.error;
      if(!currentRequest(userId,generation))return;
      const saved=mapItem(result.data);
      data={...data,active:id?data.active.map(item=>item.id===id?saved:item):[...data.active,saved]};
      render(); closeModal(); showToast(id?'Food item updated.':'Added to your inventory.');
    } catch(error) { if(currentRequest(userId,generation)){await refreshAccountData(userId,generation);await showDataError(error,'Could not save this food item.');} }
  }
  async function recordOutcome(id,outcome) {
    if(dataState!=='ready'||!currentUserId)return;
    if(!['consumed','wasted'].includes(outcome)){showToast('Choose a valid food outcome.','error');return;}
    const item=data.active.find(x=>x.id===id); if(!item)return;
    const userId=currentUserId,generation=authGeneration;
    try {
      const {error}=await supabaseClient.rpc('record_food_outcome',{p_food_item_id:id,p_outcome:outcome,p_recorded_at:new Date().toISOString(),p_recorded_date:todayKey()});
      if(error)throw error;
      if(currentRequest(userId,generation))await writeSucceededRefresh(userId,generation,`${item.name} marked as ${outcome}.`);
    } catch(error) { if(currentRequest(userId,generation)){await refreshAccountData(userId,generation);await showDataError(error,`Could not mark ${item.name} as ${outcome}.`);} }
  }
  async function deleteItem(id) {
    if(dataState!=='ready'||!currentUserId)return;
    const item=data.active.find(x=>x.id===id); if(!item)return;
    if(!confirm(t('You are about to permanently delete {name} from your cloud inventory. This will not add it to history.',{name:item.name})))return;
    const userId=currentUserId,generation=authGeneration;
    try {
      const {data:deleted,error}=await supabaseClient.from('food_items').delete().eq('id',id).eq('user_id',userId).select('id').single();
      if(error)throw error;
      if(!deleted)throw new Error('The item was not found in your account. Refresh and try again.');
      if(!currentRequest(userId,generation))return;
      data={...data,active:data.active.filter(row=>row.id!==id)}; render(); showToast('Food item deleted.');
    } catch(error) { if(currentRequest(userId,generation)){await refreshAccountData(userId,generation);await showDataError(error,'Could not delete this food item.');} }
  }
  async function loadDemo() {
    if(dataState!=='ready'||!currentUserId)return;
    if(!confirm(t('Add the FoodWise demo items to this signed-in account in Supabase? These sample records will be visible in your cloud inventory.')))return;
    const userId=currentUserId,generation=authGeneration,today=parseLocalDate(todayKey()),offset=n=>{const d=new Date(today);d.setDate(d.getDate()+n);return dateInput(d);};
    const samples=[['Baby spinach','Vegetables',1,'bag',0,49],['Greek yogurt','Dairy',2,'cups',2,65],['Strawberries','Fruits',1,'box',3,89],['Chicken breast','Meat & Seafood',500,'g',5,135],['Oat milk','Beverages',1,'L',10,79],['Frozen peas','Frozen Food',1,'pack',40,55]];
    const activeRows=samples.map(([name,category,quantity,unit,days,price])=>({user_id:userId,name,category,quantity,unit,purchase_date:offset(-2),expiry_date:offset(days),price,updated_at:new Date().toISOString()}));
    const recordAt=new Date(Date.now()-86400000),historyRows=data.history.length?[]:[{user_id:userId,food_item_id:null,legacy_item_id:null,legacy_record_id:`foodwise-demo-v1:${makeId()}`,outcome:'consumed',recorded_at:recordAt.toISOString(),recorded_date:offset(-1),item_name:'Ripe bananas',item_category:'Fruits',item_quantity:3,item_unit:'pcs',item_purchase_date:offset(-6),item_expiry_date:offset(-1),item_price:45,item_updated_at:null}];
    try {
      const {error:activeError}=await supabaseClient.from('food_items').insert(activeRows); if(activeError)throw activeError;
      if(!currentRequest(userId,generation))return;
      if(historyRows.length){const {error:historyError}=await supabaseClient.from('food_history').insert(historyRows);if(historyError)throw historyError;}
      if(currentRequest(userId,generation))await writeSucceededRefresh(userId,generation,'Demo items added to your account.');
    } catch(error) { if(currentRequest(userId,generation)){await refreshAccountData(userId,generation);await showDataError(error,'Demo data could not be added completely. Your cloud data was refreshed.');} }
  }
  async function resetData() {
    if(!currentUserId||dataState!=='ready')return;
    if(!confirm(t('Permanently delete all food inventory and history from this signed-in account in Supabase? This cannot be undone.')))return;
    const userId=currentUserId,generation=authGeneration;
    try {
      const {error:itemsError}=await supabaseClient.from('food_items').delete().eq('user_id',userId); if(itemsError)throw itemsError;
      if(!currentRequest(userId,generation))return;
      const {error:historyError}=await supabaseClient.from('food_history').delete().eq('user_id',userId); if(historyError)throw historyError;
      if(currentRequest(userId,generation))await writeSucceededRefresh(userId,generation,'Your account inventory and history have been reset.');
    } catch(error) { if(currentRequest(userId,generation)){await refreshAccountData(userId,generation);await showDataError(error,'Reset did not complete fully. The account data shown has been refreshed.');} }
  }
  function showAuthState({loading=false,message='',error='',configurationError=false,loadingMessage='Checking your session…',retry=false,retryAction:nextRetryAction=null,retryLabel=''}={}) {
    const app=document.querySelector('.app-shell');
    app.hidden=true;
    $('auth-screen').hidden=false;
    $('auth-loading').hidden=!loading;
    setLocalizedText($('auth-loading-message'),loadingMessage,'message');
    $('auth-form-panel').hidden=loading||configurationError;
    $('auth-message').hidden=!message;
    if(message)setLocalizedText($('auth-message'),message,'message');else{$('auth-message').textContent='';delete $('auth-message').dataset.i18nText;}
    $('auth-error').hidden=!error;
    if(error)setLocalizedText($('auth-error'),error,'message');else{$('auth-error').textContent='';delete $('auth-error').dataset.i18nText;}
    retryAction=nextRetryAction||(retry?'cloud':null);
    $('retry-cloud-load').hidden=!retryAction;
    const retryText=retryLabel||(retryAction==='session'?'Try Again':'Retry loading data');
    setLocalizedText($('retry-cloud-load'),retryText);
  }
  function setAuthMode(mode) {
    authMode=mode;
    const signingUp=mode==='signup';
    $('auth-title').dataset.i18n=signingUp?'Create your account':'Welcome back'; $('auth-title').textContent=t($('auth-title').dataset.i18n);
    $('auth-description').dataset.i18n=signingUp?'Start keeping track of your kitchen.':'Sign in to continue to FoodWise.'; $('auth-description').textContent=t($('auth-description').dataset.i18n);
    $('auth-submit').dataset.i18nButton=signingUp?'Create account':'Sign in'; $('auth-submit').innerHTML=`${escapeHtml(t($('auth-submit').dataset.i18nButton))} <span>→</span>`;
    $('auth-switch-copy').dataset.i18n=signingUp?'Already have an account?':'New to FoodWise?'; $('auth-switch-copy').textContent=t($('auth-switch-copy').dataset.i18n);
    $('auth-mode-toggle').dataset.i18n=signingUp?'Sign in':'Create an account'; $('auth-mode-toggle').textContent=t($('auth-mode-toggle').dataset.i18n);
    $('auth-password').autocomplete=signingUp?'new-password':'current-password';
    $('auth-resend-line').hidden=signingUp;
    showAuthState();
  }
  function showAuthFeedback({message='',error=''}={}) {
    $('auth-message').hidden=!message;
    if(message)setLocalizedText($('auth-message'),message,'message');else{$('auth-message').textContent='';delete $('auth-message').dataset.i18nText;}
    $('auth-error').hidden=!error;
    if(error)setLocalizedText($('auth-error'),error,'message');else{$('auth-error').textContent='';delete $('auth-error').dataset.i18nText;}
  }
  async function resendConfirmationEmail() {
    if(!supabaseClient||authMode!=='signin')return;
    const email=$('auth-email').value.trim();
    if(!email||!$('auth-email').validity.valid) {
      showAuthFeedback({error:'Enter the email address you used to register.'});
      $('auth-email').focus();
      return;
    }
    const button=$('resend-confirmation');
    button.disabled=true;
    button.dataset.i18n='Sending…'; button.textContent=t(button.dataset.i18n);
    $('auth-mode-toggle').disabled=true;
    try {
      const {error}=await supabaseClient.auth.resend({type:'signup',email,options:{emailRedirectTo:EMAIL_CONFIRMATION_REDIRECT}});
      if(error)throw error;
      showAuthFeedback({message:`Confirmation email requested for ${email}. Check your inbox and spam folder.`});
    } catch(error) {
      const detail=error?.message||'';
      const rateLimited=error?.status===429||/rate.?limit|too many requests|security purposes/i.test(detail);
      showAuthFeedback({error:rateLimited?'Too many confirmation requests. Please wait a few minutes before trying again.':'Could not resend the confirmation email. Check your connection and try again.'});
    } finally {
      button.disabled=false;
      button.dataset.i18n='Resend confirmation email'; button.textContent=t(button.dataset.i18n);
      $('auth-mode-toggle').disabled=false;
    }
  }
  function completeAuthInitializationAttempt() {
    if(!authInitializationPending)return;
    authInitializationPending=false;
    if(authInitializationTimer){clearTimeout(authInitializationTimer);authInitializationTimer=null;}
  }
  function failAuthInitializationAttempt(attempt,message) {
    if(attempt!==authInitializationAttempt||!authInitializationPending)return;
    completeAuthInitializationAttempt();
    showAuthState({configurationError:true,error:message,retryAction:'session',retryLabel:'Try Again'});
  }
  function beginAuthInitializationAttempt() {
    const attempt=++authInitializationAttempt,observedVersion=authEventVersion;
    authInitializationPending=true;
    showAuthState({loading:true,loadingMessage:'Checking your session…'});
    authInitializationTimer=setTimeout(()=>{
      failAuthInitializationAttempt(attempt,'FoodWise could not finish checking your session within 15 seconds. Check your connection and try again.');
    },AUTH_INITIALIZATION_TIMEOUT_MS);
    Promise.resolve().then(()=>supabaseClient.auth.getSession()).then(({data:sessionData,error})=>{
      if(attempt!==authInitializationAttempt||!authInitializationPending)return;
      // An auth event has already taken responsibility for this attempt.
      // Its deferred handler will complete initialization and clear the timer.
      if(authEventVersion!==observedVersion)return;
      if(error){failAuthInitializationAttempt(attempt,'Could not restore your session. Check your connection and try again.');return;}
      completeAuthInitializationAttempt();
      handleAuthState('INITIAL_SESSION',sessionData.session);
    }).catch(()=>failAuthInitializationAttempt(attempt,'Could not restore your session. Check your connection and try again.'));
  }
  function handleAuthState(event,session) {
    completeAuthInitializationAttempt();
    if(authCallbackPending) {
      // The Supabase client has now restored or rejected the URL callback.
      // Only now is it safe for app navigation to replace its token fragment.
      authCallbackPending=false;
      navigate('dashboard');
    }
    if(!session) {
      authGeneration++; startedLoadGeneration=-1; currentUserId=null;
      data={active:[],history:[]}; dataState='signed_out';
      document.querySelector('.app-shell').hidden=true;
      $('auth-user-label').textContent='';
      showAuthState();
      return;
    }
    const nextUserId=session.user?.id;
    if(!nextUserId)return;
    if(nextUserId!==currentUserId) {
      authGeneration++; startedLoadGeneration=-1; currentUserId=nextUserId;
      data={active:[],history:[]}; dataState='loading';
      document.querySelector('.app-shell').hidden=true;
      $('auth-password').value=''; $('auth-user-label').textContent='';
    } else if(dataState==='ready') {
      $('auth-user-label').textContent=session.user.email||'';
      return;
    }
    const generation=authGeneration;
    if(startedLoadGeneration===generation)return;
    startedLoadGeneration=generation; dataState='loading';
    $('auth-user-label').textContent=session.user.email||'';
    showCloudStatus('Verifying your account and loading your food data…',{loading:true});
    fetchAccountData(nextUserId,generation).catch(error=>{
      if(!currentRequest(nextUserId,generation))return;
      if(error?.status===401||/jwt expired|invalid.*token|token.*expired/i.test(error?.message||'')){handleExpiredSession(error);return;}
      data={active:[],history:[]}; dataState='error';
      showCloudStatus(`Could not load your account data: ${error?.message||'Please try again.'}`,{error:true,retry:true});
    });
  }
  async function retryCloudLoad() {
    if(!supabaseClient)return;
    try {
      const {data:sessionData,error}=await supabaseClient.auth.getSession();
      if(error||!sessionData?.session){handleAuthState('SIGNED_OUT',null);showAuthState({error:'Your session has ended. Please sign in again.'});return;}
      startedLoadGeneration=-1; dataState='loading';
      handleAuthState('RETRY',sessionData.session);
    } catch { showCloudStatus('Could not restore your session. Please sign in again.',{retry:false}); showAuthState({error:'Could not restore your session. Please sign in again.'}); }
  }
  function initializeSupabaseAuth() {
    const config=window.FOODWISE_SUPABASE_CONFIG;
    const url=config?.projectUrl;
    const key=config?.publishableKey;
    const urlLooksValid=typeof url==='string'&&/^https?:\/\//i.test(url)&&!url.includes('YOUR_SUPABASE');
    const keyLooksValid=typeof key==='string'&&key.startsWith('sb_publishable_')&&!key.includes('YOUR_SUPABASE');
    if(!urlLooksValid||!keyLooksValid) {
      showAuthState({configurationError:true,error:'Add your Supabase Project URL and Publishable key to supabase-config.js to enable email authentication.'});
      return;
    }
    if(!window.supabase?.createClient) {
      showAuthState({configurationError:true,error:'The Supabase JavaScript client could not load. Check your connection and reload the page.'});
      return;
    }
    try {
      if(!supabaseClient)supabaseClient=window.supabase.createClient(url,key);
      if(!authListenerRegistered) {
        const subscription=supabaseClient.auth.onAuthStateChange((event,session)=>{
          authEventVersion++;
          setTimeout(()=>handleAuthState(event,session),0);
        });
        authListenerRegistered=true;
        // Retain the one subscription so retries never register another.
        window.foodwiseAuthSubscription=subscription.data.subscription;
      }
      beginAuthInitializationAttempt();
    } catch {
      showAuthState({configurationError:true,error:'FoodWise could not initialize Supabase authentication. Check supabase-config.js.'});
    }
  }
  function retrySessionInitialization() {
    if(!supabaseClient){initializeSupabaseAuth();return;}
    beginAuthInitializationAttempt();
  }
  async function submitAuthForm(event) {
    event.preventDefault();
    if(!supabaseClient)return;
    const email=$('auth-email').value.trim();
    const password=$('auth-password').value;
    if(!email||!$('auth-email').validity.valid) { showAuthState({error:'Enter a valid email address.'}); return; }
    if(!password) { showAuthState({error:'Enter your password.'}); return; }
    $('auth-submit').disabled=true;
    $('auth-mode-toggle').disabled=true;
    showAuthState({loading:true});
    try {
      if(authMode==='signup') {
        const {data:result,error}=await supabaseClient.auth.signUp({email,password,options:{emailRedirectTo:EMAIL_CONFIRMATION_REDIRECT}});
        if(error)throw error;
        if(result.session) {
          if(!currentUserId)showAuthState({message:'Account created. Opening FoodWise…'});
        } else {
          showAuthState({message:'Check your email for the confirmation link, then return here to sign in.'});
        }
      } else {
        const {error}=await supabaseClient.auth.signInWithPassword({email,password});
        if(error)throw error;
        if(!currentUserId)showAuthState({message:'Signed in. Opening FoodWise…'});
      }
    } catch(error) {
      showAuthState({error:error?.message||'Authentication failed. Please try again.'});
    } finally {
      $('auth-submit').disabled=false;
      $('auth-mode-toggle').disabled=false;
    }
  }
  async function signOut() {
    if(!supabaseClient)return;
    data={active:[],history:[]};
    dataState='loading'; authGeneration++; startedLoadGeneration=-1;
    document.querySelector('.app-shell').hidden=true;
    showAuthState({loading:true,loadingMessage:'Signing out…'});
    $('sign-out').disabled=true;
    try {
      const {error}=await supabaseClient.auth.signOut();
      if(error)throw error;
    } catch(error) {
      showToast(error?.message||'Could not sign out. Please try again.','error');
      try {
        const {data:sessionData}=await supabaseClient.auth.getSession();
        if(sessionData?.session){startedLoadGeneration=-1;handleAuthState('SIGNED_IN',sessionData.session);}
        else {currentUserId=null;dataState='signed_out';showAuthState({error:'Could not confirm your session. Sign in again.'});}
      } catch { currentUserId=null;dataState='signed_out';showAuthState({error:'Could not confirm your session. Sign in again.'}); }
    } finally {
      $('sign-out').disabled=false;
    }
  }
  function init(){
    currentLanguage=readLanguage();
    CATEGORIES.forEach(category=>{const optionLabel=t(category),formOption=document.createElement('option'),filterOption=document.createElement('option');formOption.value=category;formOption.textContent=optionLabel;$('food-category').append(formOption);filterOption.value=category;filterOption.textContent=optionLabel;$('category-filter').append(filterOption);});
    document.querySelectorAll('.language-switcher').forEach(select=>select.addEventListener('change',()=>setLanguage(select.value)));
    $('add-item-top').onclick=()=>openModal(); $('add-item-quick').onclick=()=>openModal(); $('add-item-inventory').onclick=()=>openModal(); $('load-demo').onclick=loadDemo; $('reset-data').onclick=resetData; $('retry-cloud-load').onclick=()=>retryAction==='session'?retrySessionInitialization():retryCloudLoad(); $('search-input').addEventListener('input',renderInventory); ['category-filter','status-filter','sort-select'].forEach(id=>$(id).addEventListener('change',renderInventory)); $('item-form').addEventListener('submit',e=>{e.preventDefault();const values=validateForm();if(values)addOrUpdate(values);}); document.querySelectorAll('[data-close-modal]').forEach(el=>el.addEventListener('click',closeModal)); document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();}); document.addEventListener('click',e=>{const button=e.target.closest('[data-action]');if(!button)return;const {action,id}=button.dataset;if(action==='add')openModal();if(action==='edit')openModal(data.active.find(x=>x.id===id));if(action==='delete')deleteItem(id);if(action==='consumed'||action==='wasted')recordOutcome(id,action);}); document.querySelectorAll('a[data-page]').forEach(link=>link.addEventListener('click',e=>{e.preventDefault();navigate(link.dataset.page);})); window.addEventListener('hashchange',()=>{const page=location.hash.slice(1);navigate(['dashboard','inventory','use-first','history'].includes(page)?page:'dashboard');});
    applyLanguage();
    const page=location.hash.slice(1);navigate(['dashboard','inventory','use-first','history'].includes(page)?page:'dashboard'); render(); $('auth-form').addEventListener('submit',submitAuthForm); $('auth-mode-toggle').addEventListener('click',()=>setAuthMode(authMode==='signin'?'signup':'signin')); $('sign-out').addEventListener('click',signOut); setAuthMode('signin'); showAuthState({loading:true}); initializeSupabaseAuth();
  }
  init();
  $('resend-confirmation').addEventListener('click',resendConfirmationEmail);
})();
