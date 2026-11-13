/* FoodWise stores authenticated inventory and history in Supabase. */
(() => {
  'use strict';
  const ITEM_COLUMNS='id,user_id,legacy_id,name,category,quantity,unit,purchase_date,expiry_date,price,updated_at,created_at';
  const HISTORY_COLUMNS='id,user_id,food_item_id,legacy_item_id,legacy_record_id,outcome,recorded_at,recorded_date,item_name,item_category,item_quantity,item_unit,item_purchase_date,item_expiry_date,item_price,item_updated_at';
  const CATEGORIES = ['Fruits', 'Vegetables', 'Meat & Seafood', 'Dairy', 'Beverages', 'Frozen Food', 'Snacks', 'Other'];
  const ICONS = { Fruits:'🍊', Vegetables:'🥬', 'Meat & Seafood':'🐟', Dairy:'🥛', Beverages:'🧃', 'Frozen Food':'🧊', Snacks:'🥨', Other:'🍽️' };
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
  const statusText = (item) => { const days=daysUntil(item.expiryDate); if(days===0)return 'Due Today'; if(days<0)return `${Math.abs(days)} day${Math.abs(days)===1?'':'s'} overdue`; if(days===1)return '1 day left'; return `${days} days left`; };
  const formatDate = (value) => { const d=parseLocalDate(value); return d ? new Intl.DateTimeFormat(undefined,{day:'numeric',month:'short',year:'numeric'}).format(d) : '—'; };
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = (amount) => new Intl.NumberFormat(undefined,{style:'currency',currency:'THB',maximumFractionDigits:2}).format(amount || 0);
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
  function navigate(page) { const target=$(`page-${page}`); if(!target)return; document.querySelectorAll('.page').forEach(el=>el.classList.remove('active')); target.classList.add('active'); document.querySelectorAll('.nav-link').forEach(el=>el.classList.toggle('active',el.dataset.page===page)); if(!authCallbackPending&&location.hash!==`#${page}`)history.replaceState(null,'',`#${page}`); window.scrollTo(0,0); }
  function openModal(item) { const form=$('item-form'); form.reset(); document.querySelectorAll('.field').forEach(x=>x.classList.remove('invalid')); document.querySelectorAll('.field-error').forEach(x=>x.textContent=''); $('item-id').value=item?.id||''; $('modal-title').textContent=item?'Edit food':'Add food'; $('save-item').innerHTML=item?'Save changes <span>→</span>':'Add to inventory <span>→</span>'; if(item){$('food-name').value=item.name;$('food-category').value=item.category;$('food-quantity').value=item.quantity;$('food-unit').value=item.unit;$('food-expiry').value=item.expiryDate;$('food-purchase-date').value=item.purchaseDate||'';$('food-price').value=item.price??'';} $('item-modal').classList.add('open'); $('item-modal').setAttribute('aria-hidden','false'); setTimeout(()=>$('food-name').focus(),50); }
  function closeModal(){ $('item-modal').classList.remove('open'); $('item-modal').setAttribute('aria-hidden','true'); }
  function validateForm() { const values={name:$('food-name').value.trim(),category:$('food-category').value,quantity:$('food-quantity').value,unit:$('food-unit').value,expiryDate:$('food-expiry').value,purchaseDate:$('food-purchase-date').value,price:$('food-price').value}; const errors={}; if(!values.name)errors.name='Please enter a food name.'; if(!CATEGORIES.includes(values.category))errors.category='Choose a category.'; if(!Number.isFinite(Number(values.quantity))||Number(values.quantity)<=0)errors.quantity='Quantity must be greater than zero.'; if(!values.unit)errors.unit='Choose a unit.'; if(!parseLocalDate(values.expiryDate))errors.expiryDate='Enter a valid expiration date.'; if(values.purchaseDate&&!parseLocalDate(values.purchaseDate))errors.purchaseDate='Enter a valid purchase date.'; if(values.price!==''&&(!Number.isFinite(Number(values.price))||Number(values.price)<0))errors.price='Price must be zero or more.'; document.querySelectorAll('.field').forEach(f=>f.classList.remove('invalid')); document.querySelectorAll('.field-error').forEach(e=>e.textContent=''); Object.entries(errors).forEach(([key,message])=>{const input=document.querySelector(`[name="${key}"]`); if(input){input.closest('.field').classList.add('invalid'); const err=document.querySelector(`[data-error="${key}"]`); if(err)err.textContent=message;}}); return Object.keys(errors).length?null:values; }
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
    if(!confirm(`Permanently delete ${item.name} from your cloud inventory? This will not add it to history.`))return;
    const userId=currentUserId,generation=authGeneration;
    try {
      const {data:deleted,error}=await supabaseClient.from('food_items').delete().eq('id',id).eq('user_id',userId).select('id').single();
      if(error)throw error;
      if(!deleted)throw new Error('This item was not found in your account. Refresh and try again.');
      if(!currentRequest(userId,generation))return;
      data={...data,active:data.active.filter(row=>row.id!==id)}; render(); showToast('Food item deleted.');
    } catch(error) { if(currentRequest(userId,generation)){await refreshAccountData(userId,generation);await showDataError(error,'Could not delete this food item.');} }
  }
  async function loadDemo() {
    if(dataState!=='ready'||!currentUserId)return;
    if(!confirm('Add the FoodWise demo items to this signed-in account in Supabase? These sample records will be visible in your cloud inventory.'))return;
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
    if(!confirm('Permanently delete all food inventory and history from this signed-in account in Supabase? This cannot be undone.'))return;
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
    $('auth-loading-message').textContent=loadingMessage;
    $('auth-form-panel').hidden=loading||configurationError;
    $('auth-message').hidden=!message;
    $('auth-message').textContent=message;
    $('auth-error').hidden=!error;
    $('auth-error').textContent=error;
    retryAction=nextRetryAction||(retry?'cloud':null);
    $('retry-cloud-load').hidden=!retryAction;
    $('retry-cloud-load').textContent=retryLabel||(retryAction==='session'?'Try Again':'Retry loading data');
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
  function init(){ CATEGORIES.forEach(c=>{const a=document.createElement('option');a.value=c;a.textContent=c;$('food-category').append(a);const b=document.createElement('option');b.value=c;b.textContent=c;$('category-filter').append(b);}); $('today-label').textContent=new Intl.DateTimeFormat(undefined,{weekday:'long',month:'long',day:'numeric'}).format(new Date()); $('add-item-top').onclick=()=>openModal(); $('add-item-quick').onclick=()=>openModal(); $('add-item-inventory').onclick=()=>openModal(); $('load-demo').onclick=loadDemo; $('reset-data').onclick=resetData; $('retry-cloud-load').onclick=()=>retryAction==='session'?retrySessionInitialization():retryCloudLoad(); $('search-input').addEventListener('input',renderInventory); ['category-filter','status-filter','sort-select'].forEach(id=>$(id).addEventListener('change',renderInventory)); $('item-form').addEventListener('submit',e=>{e.preventDefault();const values=validateForm();if(values)addOrUpdate(values);}); document.querySelectorAll('[data-close-modal]').forEach(el=>el.addEventListener('click',closeModal)); document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();}); document.addEventListener('click',e=>{const button=e.target.closest('[data-action]');if(!button)return;const {action,id}=button.dataset;if(action==='add')openModal();if(action==='edit')openModal(data.active.find(x=>x.id===id));if(action==='delete')deleteItem(id);if(action==='consumed'||action==='wasted')recordOutcome(id,action);}); document.querySelectorAll('a[data-page]').forEach(link=>link.addEventListener('click',e=>{e.preventDefault();navigate(link.dataset.page);})); window.addEventListener('hashchange',()=>{const page=location.hash.slice(1);navigate(['dashboard','inventory','use-first','history'].includes(page)?page:'dashboard');}); const page=location.hash.slice(1);navigate(['dashboard','inventory','use-first','history'].includes(page)?page:'dashboard'); render(); $('auth-form').addEventListener('submit',submitAuthForm); $('auth-mode-toggle').addEventListener('click',()=>setAuthMode(authMode==='signin'?'signup':'signin')); $('sign-out').addEventListener('click',signOut); setAuthMode('signin'); showAuthState({loading:true}); initializeSupabaseAuth(); }
  init();
})();
