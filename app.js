/* FoodWise stores all inventory and history locally in this browser. */
(() => {
  'use strict';
  const STORAGE_KEY = 'foodwise-data-v1';
  const CATEGORIES = ['Fruits', 'Vegetables', 'Meat & Seafood', 'Dairy', 'Beverages', 'Frozen Food', 'Snacks', 'Other'];
  const ICONS = { Fruits:'🍊', Vegetables:'🥬', 'Meat & Seafood':'🐟', Dairy:'🥛', Beverages:'🧃', 'Frozen Food':'🧊', Snacks:'🥨', Other:'🍽️' };
  const $ = (id) => document.getElementById(id);
  const dateInput = (date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const todayKey = () => dateInput(new Date());
  const parseLocalDate = (value) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null; const [y,m,d] = value.split('-').map(Number); const date = new Date(y,m-1,d); return date.getFullYear()===y && date.getMonth()===m-1 && date.getDate()===d ? date : null; };
  const daysUntil = (value) => { const target=parseLocalDate(value), today=parseLocalDate(todayKey()); if(!target||!today)return null; return Math.round((target-today)/86400000); };
  const expiryStatus = (item) => { const days=daysUntil(item.expiryDate); return days===null ? 'expired' : days<0 ? 'expired' : days<=3 ? 'soon' : 'fresh'; };
  const statusText = (item) => { const days=daysUntil(item.expiryDate); if(days===0)return 'Due Today'; if(days<0)return `${Math.abs(days)} day${Math.abs(days)===1?'':'s'} overdue`; if(days===1)return '1 day left'; return `${days} days left`; };
  const formatDate = (value) => { const d=parseLocalDate(value); return d ? new Intl.DateTimeFormat(undefined,{day:'numeric',month:'short',year:'numeric'}).format(d) : '—'; };
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = (amount) => new Intl.NumberFormat(undefined,{style:'currency',currency:'THB',maximumFractionDigits:2}).format(amount || 0);
  const makeId = () => globalThis.crypto?.randomUUID ? crypto.randomUUID() : `fw-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const validRecord = (item) => item && typeof item.id==='string' && typeof item.name==='string' && CATEGORIES.includes(item.category) && Number.isFinite(Number(item.quantity)) && Number(item.quantity)>0 && typeof item.unit==='string' && parseLocalDate(item.expiryDate);
  function loadData() {
    try { const raw=localStorage.getItem(STORAGE_KEY); if(!raw)return {active:[],history:[]}; const value=JSON.parse(raw); if(!value||!Array.isArray(value.active)||!Array.isArray(value.history))return {active:[],history:[]}; return {active:value.active.filter(validRecord),history:value.history.filter(x=>x&&validRecord(x.item)&&['consumed','wasted'].includes(x.outcome))}; }
    catch { return {active:[],history:[]}; }
  }
  // Keep app data empty until authentication has resolved. The LocalStorage
  // key and its existing shape remain unchanged in this authentication phase.
  let data={active:[],history:[]};
  let supabaseClient=null;
  let currentUserId=null;
  let localInventoryAvailable=false;
  let authMode='signin';
  let authEventVersion=0;
  function save(nextData=data) { try { localStorage.setItem(STORAGE_KEY,JSON.stringify(nextData)); return true; } catch { showToast('Could not save your changes. Your previous data is still available. Check browser storage and try again.','error'); return false; } }
  function commitData(nextData,successMessage) { if(!localInventoryAvailable){showToast('Local inventory is unavailable until its ownership is confirmed. Your browser data has not been changed.','error');return false;} if(!save(nextData))return false; data=nextData; render(); if(successMessage)showToast(successMessage); return true; }
  function showToast(message,type='success') { const toast=document.createElement('div'); toast.className=`toast ${type==='error'?'error':''}`; toast.textContent=message; $('toast-region').append(toast); setTimeout(()=>toast.remove(),3200); }
  function statusPill(item) { const status=expiryStatus(item), label=status==='fresh'?'Fresh':status==='soon'?statusText(item):'Expired'; return `<span class="status-pill status-${status}">${label}</span>`; }
  function itemIcon(item) { return ICONS[item.category] || '🍽️'; }
  function sortItems(items) { const mode=$('sort-select').value; return [...items].sort((a,b)=>mode==='name-asc'?a.name.localeCompare(b.name):mode==='expiry-desc'?b.expiryDate.localeCompare(a.expiryDate):a.expiryDate.localeCompare(b.expiryDate)); }
  function emptyState(title,description,button=false) { return `<div class="empty-state"><div class="empty-illustration">✿</div><h3>${title}</h3><p>${description}</p>${button?'<button class="button button-primary" data-action="add">＋ Add food</button>':''}</div>`; }
  function renderDashboard() {
    const active=data.active, statuses=active.map(expiryStatus), attention=active.filter(x=>expiryStatus(x)!=='fresh').sort((a,b)=>a.expiryDate.localeCompare(b.expiryDate));
    $('stat-active').textContent=active.length; $('stat-soon').textContent=statuses.filter(x=>x==='soon').length; $('stat-expired').textContent=statuses.filter(x=>x==='expired').length; $('stat-consumed').textContent=data.history.filter(x=>x.outcome==='consumed').length; $('nav-count').textContent=active.length; $('attention-count').textContent=attention.length;
    $('attention-list').innerHTML=attention.length?attention.slice(0,4).map(item=>`<div class="attention-row"><div class="food-avatar">${itemIcon(item)}</div><div class="food-main"><div class="food-name">${escapeHtml(item.name)}</div><div class="food-meta">${escapeHtml(item.quantity)} ${escapeHtml(item.unit)} · ${escapeHtml(item.category)}</div></div><span class="attention-days ${expiryStatus(item)==='expired'?'expired':''}">${escapeHtml(statusText(item))}</span><div class="row-actions"><button class="icon-button" data-action="consumed" data-id="${escapeHtml(item.id)}" title="Mark consumed">✓</button></div></div>`).join(''):emptyState('Looking good!','Nothing needs your attention right now.');
  }
  function renderInventory() {
    const q=$('search-input').value.trim().toLowerCase(), cat=$('category-filter').value, stat=$('status-filter').value;
    const items=sortItems(data.active.filter(item=>(!q||item.name.toLowerCase().includes(q))&&(!cat||item.category===cat)&&(!stat||expiryStatus(item)===stat)));
    $('inventory-list').innerHTML=items.length?`<table class="inventory-table"><thead><tr><th>Food</th><th>Quantity</th><th>Category</th><th>Expires</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${items.map(item=>`<tr><td><div class="item-cell"><div class="food-avatar">${itemIcon(item)}</div><div><div class="food-name">${escapeHtml(item.name)}</div><div class="food-meta">${item.purchaseDate?`Bought ${formatDate(item.purchaseDate)}`:''}</div></div></div></td><td>${escapeHtml(item.quantity)} ${escapeHtml(item.unit)}</td><td>${escapeHtml(item.category)}</td><td>${formatDate(item.expiryDate)}</td><td>${statusPill(item)}</td><td><div class="table-actions"><button class="icon-button" data-action="consumed" data-id="${escapeHtml(item.id)}" title="Mark consumed">✓</button><button class="icon-button" data-action="wasted" data-id="${escapeHtml(item.id)}" title="Mark wasted">Waste</button><button class="icon-button" data-action="edit" data-id="${escapeHtml(item.id)}" title="Edit">Edit</button><button class="icon-button" data-action="delete" data-id="${escapeHtml(item.id)}" title="Delete">×</button></div></td></tr>`).join('')}</tbody></table>`:emptyState(data.active.length?'No matching food':'Your inventory is ready for a fresh start',data.active.length?'Try a different search or filter.':'Add what you have at home and FoodWise will help you keep track.',!data.active.length);
  }
  function renderUseFirst() { const items=[...data.active].sort((a,b)=>a.expiryDate.localeCompare(b.expiryDate)); $('use-first-list').innerHTML=items.length?items.map(item=>`<article class="use-card"><div class="food-avatar">${itemIcon(item)}</div><div class="food-main"><div class="food-name">${escapeHtml(item.name)}</div><div class="food-meta">${escapeHtml(item.quantity)} ${escapeHtml(item.unit)} · ${escapeHtml(item.category)}</div><div class="use-date">${escapeHtml(statusText(item))} · expires ${formatDate(item.expiryDate)}</div><button class="icon-button" data-action="consumed" data-id="${escapeHtml(item.id)}">✓ Mark consumed</button></div>${statusPill(item)}</article>`).join(''):emptyState('Nothing on the shelf yet','Add food to see what you should use first.',true); }
  function renderHistory() {
    const consumed=data.history.filter(x=>x.outcome==='consumed'), wasted=data.history.filter(x=>x.outcome==='wasted'), total=consumed.length+wasted.length, angle=total?Math.round(consumed.length/total*360):0, value=wasted.reduce((sum,x)=>sum+(Number(x.item.price)||0),0);
    $('chart-area').innerHTML=total?`<div class="donut" style="--consumed-angle:${angle}deg"><div class="donut-center">${total}<small>items</small></div></div><div class="chart-legend"><div class="legend-row"><span class="legend-label"><i class="legend-dot"></i> Consumed</span><strong>${consumed.length}</strong></div><div class="legend-row"><span class="legend-label"><i class="legend-dot wasted"></i> Wasted</span><strong>${wasted.length}</strong></div></div>`:emptyState('Your story starts here','Mark food as consumed or wasted to build your summary.');
    $('waste-value').textContent=money(value); const rows=[...data.history].sort((a,b)=>String(b.recordedAt).localeCompare(String(a.recordedAt)));
    $('history-list').innerHTML=rows.length?rows.map(x=>`<div class="history-row"><div class="food-avatar">${itemIcon(x.item)}</div><div class="food-main"><div class="food-name">${escapeHtml(x.item.name)}</div><div class="food-meta">${escapeHtml(x.item.quantity)} ${escapeHtml(x.item.unit)} · ${escapeHtml(x.item.category)}</div></div><span class="history-badge ${x.outcome}">${x.outcome==='consumed'?'✓ Consumed':'Wasted'}</span><span class="history-date">${formatDate(x.recordedDate)}</span></div>`).join(''):emptyState('No history yet','Consumed and wasted items will appear here.');
  }
  function render() { renderDashboard(); renderInventory(); renderUseFirst(); renderHistory(); }
  function navigate(page) { const target=$(`page-${page}`); if(!target)return; document.querySelectorAll('.page').forEach(el=>el.classList.remove('active')); target.classList.add('active'); document.querySelectorAll('.nav-link').forEach(el=>el.classList.toggle('active',el.dataset.page===page)); if(location.hash!==`#${page}`)history.replaceState(null,'',`#${page}`); window.scrollTo(0,0); }
  function openModal(item) { const form=$('item-form'); form.reset(); document.querySelectorAll('.field').forEach(x=>x.classList.remove('invalid')); document.querySelectorAll('.field-error').forEach(x=>x.textContent=''); $('item-id').value=item?.id||''; $('modal-title').textContent=item?'Edit food':'Add food'; $('save-item').innerHTML=item?'Save changes <span>→</span>':'Add to inventory <span>→</span>'; if(item){$('food-name').value=item.name;$('food-category').value=item.category;$('food-quantity').value=item.quantity;$('food-unit').value=item.unit;$('food-expiry').value=item.expiryDate;$('food-purchase-date').value=item.purchaseDate||'';$('food-price').value=item.price??'';} $('item-modal').classList.add('open'); $('item-modal').setAttribute('aria-hidden','false'); setTimeout(()=>$('food-name').focus(),50); }
  function closeModal(){ $('item-modal').classList.remove('open'); $('item-modal').setAttribute('aria-hidden','true'); }
  function validateForm() { const values={name:$('food-name').value.trim(),category:$('food-category').value,quantity:$('food-quantity').value,unit:$('food-unit').value,expiryDate:$('food-expiry').value,purchaseDate:$('food-purchase-date').value,price:$('food-price').value}; const errors={}; if(!values.name)errors.name='Please enter a food name.'; if(!CATEGORIES.includes(values.category))errors.category='Choose a category.'; if(!Number.isFinite(Number(values.quantity))||Number(values.quantity)<=0)errors.quantity='Quantity must be greater than zero.'; if(!values.unit)errors.unit='Choose a unit.'; if(!parseLocalDate(values.expiryDate))errors.expiryDate='Enter a valid expiration date.'; if(values.purchaseDate&&!parseLocalDate(values.purchaseDate))errors.purchaseDate='Enter a valid purchase date.'; if(values.price!==''&&(!Number.isFinite(Number(values.price))||Number(values.price)<0))errors.price='Price must be zero or more.'; document.querySelectorAll('.field').forEach(f=>f.classList.remove('invalid')); document.querySelectorAll('.field-error').forEach(e=>e.textContent=''); Object.entries(errors).forEach(([key,message])=>{const input=document.querySelector(`[name="${key}"]`); if(input){input.closest('.field').classList.add('invalid'); const err=document.querySelector(`[data-error="${key}"]`); if(err)err.textContent=message;}}); return Object.keys(errors).length?null:values; }
  function addOrUpdate(values) { const id=$('item-id').value; const previous=data.active.find(x=>x.id===id); const item={id:id||makeId(),name:values.name,category:values.category,quantity:Number(values.quantity),unit:values.unit,purchaseDate:values.purchaseDate||'',expiryDate:values.expiryDate,price:values.price===''?'':Number(values.price),status:expiryStatus({expiryDate:values.expiryDate}),updatedAt:new Date().toISOString()}; const active=previous?data.active.map(x=>x.id===id?item:x):[...data.active,item]; if(commitData({...data,active},previous?'Food item updated.':'Added to your inventory.'))closeModal(); }
  function recordOutcome(id,outcome) { const item=data.active.find(x=>x.id===id); if(!item)return; const nextData={active:data.active.filter(x=>x.id!==id),history:[...data.history,{item:{...item},outcome,recordedAt:new Date().toISOString(),recordedDate:todayKey()}]}; commitData(nextData,outcome==='consumed'?`${item.name} marked as consumed.`:`${item.name} marked as wasted.`); }
  function deleteItem(id) { const item=data.active.find(x=>x.id===id); if(!item)return; if(confirm(`Permanently delete ${item.name} from your inventory? This will not add it to your history.`)){commitData({...data,active:data.active.filter(x=>x.id!==id)},'Food item deleted.');} }
  function loadDemo() { if(data.active.length||data.history.length){if(!confirm('Demo data will be added to your current records. Your existing data will stay. Continue?'))return;} const today=parseLocalDate(todayKey()), offset=n=>{const d=new Date(today);d.setDate(d.getDate()+n);return dateInput(d);}; const demo=[['Baby spinach','Vegetables',1,'bag',0,49],['Greek yogurt','Dairy',2,'cups',2,65],['Strawberries','Fruits',1,'box',3,89],['Chicken breast','Meat & Seafood',500,'g',5,135],['Oat milk','Beverages',1,'L',10,79],['Frozen peas','Frozen Food',1,'pack',40,55]]; const active=[...data.active,...demo.map(([name,category,quantity,unit,days,price])=>({id:makeId(),name,category,quantity,unit,purchaseDate:offset(-2),expiryDate:offset(days),price,status:days<0?'expired':days<=3?'soon':'fresh'}))]; const history=[...data.history]; if(!history.length)history.push({item:{id:makeId(),name:'Ripe bananas',category:'Fruits',quantity:3,unit:'pcs',purchaseDate:offset(-6),expiryDate:offset(-1),price:45},outcome:'consumed',recordedAt:new Date(Date.now()-86400000).toISOString(),recordedDate:offset(-1)}); commitData({active,history},'Demo items added.'); }
  function resetData(){if(!confirm('Reset FoodWise and permanently remove all inventory and history saved in this browser?'))return;commitData({active:[],history:[]},'Your FoodWise data has been reset.');}
  function showAuthState({loading=false,message='',error='',configurationError=false}={}) {
    const app=document.querySelector('.app-shell');
    app.hidden=true;
    $('auth-screen').hidden=false;
    $('auth-loading').hidden=!loading;
    $('auth-form-panel').hidden=loading||configurationError;
    $('auth-message').hidden=!message;
    $('auth-message').textContent=message;
    $('auth-error').hidden=!error;
    $('auth-error').textContent=error;
  }
  function setAuthMode(mode) {
    authMode=mode;
    const signingUp=mode==='signup';
    $('auth-title').textContent=signingUp?'Create your account':'Welcome back';
    $('auth-description').textContent=signingUp?'Start keeping track of your kitchen.':'Sign in to continue to FoodWise.';
    $('auth-submit').innerHTML=signingUp?'Create account <span>→</span>':'Sign in <span>→</span>';
    $('auth-switch-copy').textContent=signingUp?'Already have an account?':'New to FoodWise?';
    $('auth-mode-toggle').textContent=signingUp?'Sign in':'Create an account';
    $('auth-password').autocomplete=signingUp?'new-password':'current-password';
    showAuthState();
  }
  function handleAuthState(event,session) {
    const nextUserId=session?.user?.id||null;
    if(nextUserId!==currentUserId) {
      // Clear the old user's view before any state for another account appears.
      data={active:[],history:[]};
      localInventoryAvailable=false;
      document.querySelector('.app-shell').hidden=true;
      $('auth-password').value='';
      $('auth-user-label').textContent='';
      currentUserId=nextUserId;
    }
    if(!session) {
      data={active:[],history:[]};
      localInventoryAvailable=false;
      showAuthState();
      return;
    }
    if(nextUserId===currentUserId&&document.querySelector('.app-shell').hidden) {
      // The shared browser key has no verified account owner, so never expose
      // or write it during an authenticated session in this phase.
      data={active:[],history:[]};
      $('local-data-notice').hidden=false;
      $('auth-user-label').textContent=session.user.email||'';
      $('auth-screen').hidden=true;
      document.querySelector('.app-shell').hidden=false;
      render();
      return;
    }
    if(event==='TOKEN_REFRESHED'||event==='USER_UPDATED') {
      $('auth-user-label').textContent=session.user.email||'';
    }
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
      supabaseClient=window.supabase.createClient(url,key);
      const subscription=supabaseClient.auth.onAuthStateChange((event,session)=>{
        authEventVersion++;
        handleAuthState(event,session);
      });
      const observedVersion=authEventVersion;
      supabaseClient.auth.getSession().then(({data:sessionData,error})=>{
        if(authEventVersion!==observedVersion)return;
        if(error) {
          showAuthState({error:'Could not restore your session. Please try signing in again.'});
          return;
        }
        handleAuthState('INITIAL_SESSION',sessionData.session);
      }).catch(()=>showAuthState({error:'Could not restore your session. Please try signing in again.'}));
      // Keep a reference so the subscription remains easy to dispose if the
      // page later gains a reinitialization flow.
      window.foodwiseAuthSubscription=subscription.data.subscription;
    } catch {
      showAuthState({configurationError:true,error:'FoodWise could not initialize Supabase authentication. Check supabase-config.js.'});
    }
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
        const {data:result,error}=await supabaseClient.auth.signUp({email,password});
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
    localInventoryAvailable=false;
    document.querySelector('.app-shell').hidden=true;
    showAuthState({loading:true});
    $('sign-out').disabled=true;
    try {
      const {error}=await supabaseClient.auth.signOut();
      if(error)throw error;
    } catch(error) {
      showToast(error?.message||'Could not sign out. Please try again.','error');
      const {data:sessionData}=await supabaseClient.auth.getSession();
      if(sessionData?.session)handleAuthState('SIGNED_IN',sessionData.session);
    } finally {
      $('sign-out').disabled=false;
    }
  }
  function init(){ CATEGORIES.forEach(c=>{const a=document.createElement('option');a.value=c;a.textContent=c;$('food-category').append(a);const b=document.createElement('option');b.value=c;b.textContent=c;$('category-filter').append(b);}); $('today-label').textContent=new Intl.DateTimeFormat(undefined,{weekday:'long',month:'long',day:'numeric'}).format(new Date()); $('add-item-top').onclick=()=>openModal(); $('add-item-quick').onclick=()=>openModal(); $('add-item-inventory').onclick=()=>openModal(); $('load-demo').onclick=loadDemo; $('reset-data').onclick=resetData; $('search-input').addEventListener('input',renderInventory); ['category-filter','status-filter','sort-select'].forEach(id=>$(id).addEventListener('change',renderInventory)); $('item-form').addEventListener('submit',e=>{e.preventDefault();const values=validateForm();if(values)addOrUpdate(values);}); document.querySelectorAll('[data-close-modal]').forEach(el=>el.addEventListener('click',closeModal)); document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();}); document.addEventListener('click',e=>{const button=e.target.closest('[data-action]');if(!button)return;const {action,id}=button.dataset;if(action==='add')openModal();if(action==='edit')openModal(data.active.find(x=>x.id===id));if(action==='delete')deleteItem(id);if(action==='consumed'||action==='wasted')recordOutcome(id,action);}); document.querySelectorAll('a[data-page]').forEach(link=>link.addEventListener('click',e=>{e.preventDefault();navigate(link.dataset.page);})); window.addEventListener('hashchange',()=>{const page=location.hash.slice(1);navigate(['dashboard','inventory','use-first','history'].includes(page)?page:'dashboard');}); const page=location.hash.slice(1);navigate(['dashboard','inventory','use-first','history'].includes(page)?page:'dashboard'); render(); $('auth-form').addEventListener('submit',submitAuthForm); $('auth-mode-toggle').addEventListener('click',()=>setAuthMode(authMode==='signin'?'signup':'signin')); $('sign-out').addEventListener('click',signOut); setAuthMode('signin'); showAuthState({loading:true}); initializeSupabaseAuth(); }
  init();
})();
