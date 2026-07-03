const API_BASE = window.location.origin;
const TOKEN_KEY = "closetElanderToken";

let products = [];
let activeProduct = null;
let sellerProfileSourceProduct = null;
let activeCategory = "all";
let currentUser = null;
let currentProfile = null;
let selectedAvatar = "avatar-1";
let adminUsers = [];
let adminProducts = [];
let pendingRegisterEmail = "";
let pendingRegisterPassword = "";

function $(id){
    return document.getElementById(id);
}

function apiHeaders(extra){
    return {
        ...(extra || {})
    };
}

function authHeaders(){
    return {};
}

async function api(path, options){
    const isFormData = options && options.body instanceof FormData;
    const response = await fetch(`${API_BASE}${path}`, {
        credentials: "include",
        ...options,
        headers: apiHeaders({
            ...(isFormData ? {} : { "Content-Type": "application/json" }),
            ...((options && options.headers) || {})
        })
    });
    const data = await response.json().catch(() => ({}));
    if(!response.ok){
        throw new Error(data.error || "Error de servidor.");
    }
    return data;
}

async function uploadApi(path, formData){
    const response = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        credentials: "include",
        headers: authHeaders(),
        body: formData
    });
    const data = await response.json().catch(() => ({}));
    if(!response.ok){
        throw new Error(data.error || "Error de servidor.");
    }
    return data;
}

function showScreen(screenName){
    document.querySelectorAll(".app-screen > div").forEach(screen => screen.classList.add("hidden"));
    const nextScreen = $(screenName);
    if(nextScreen){
        nextScreen.classList.remove("hidden");
        nextScreen.scrollTop = 0;
    }
}

function setStatus(message, type){
    const status = $("authStatus");
    status.textContent = message || "";
    status.className = type ? "status-text " + type : "status-text";
}

function setAuthBusy(isBusy){
    $("sendCodeBtn").disabled = isBusy;
    $("enterBtn").disabled = isBusy;
}

function setProfileStatus(message, type){
    const status = $("profileStatus");
    status.textContent = message || "";
    status.className = type ? "profile-status " + type : "profile-status";
}

function setPublishStatus(message, type){
    const status = $("publishStatus");
    status.textContent = message || "";
    status.className = type ? "profile-status " + type : "profile-status";
}

function setAdminStatus(message, type){
    const status = $("adminStatus");
    status.textContent = message || "";
    status.className = type ? "admin-status " + type : "admin-status";
}

function normalizeWhatsappPhone(phone){
    const raw = String(phone || "").trim();
    const digits = raw.replace(/\D/g, "");
    if(digits.length === 8) return "506" + digits;
    if(digits.length === 11 && digits.startsWith("506")) return digits;
    return digits;
}

function getCostaRicaLocalPhone(phone){
    const digits = String(phone || "").replace(/\D/g, "");
    if(digits.length === 11 && digits.startsWith("506")){
        return digits.slice(3);
    }
    return digits.slice(0, 8);
}

function isCostaRicaWhatsapp(phone){
    const normalized = normalizeWhatsappPhone(phone);
    return !normalized || /^506\d{8}$/.test(normalized);
}

function formatCostaRicaPhone(phone){
    const normalized = normalizeWhatsappPhone(phone);
    if(!isCostaRicaWhatsapp(normalized)){
        return normalized || "Sin configurar";
    }
    if(!normalized) return "Sin configurar";
    return "+506 " + normalized.slice(3, 7) + " " + normalized.slice(7);
}

function normalizeEmail(email){
    return String(email || "").trim().toLowerCase();
}

function isValidEmail(email){
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

function formatDealerId(number){
    return "Dealer#" + String(Number(number || 1)).padStart(3, "0");
}

function formatPrice(price){
    return "₡" + Number(price || 0).toLocaleString("es-CR");
}

function escapeAdminHtml(value){
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatAdminDate(value){
    if(!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("es-CR");
}

function getProductName(product){
    return product.name || product.title || "Prenda sin nombre";
}

function getProductImage(product){
    return product.image_url || product.image || product.photo_url || "";
}

function getProductPhone(product){
    return normalizeWhatsappPhone(product.seller_whatsapp || product.seller_whatsapp_phone || product.seller_phone || product.whatsapp_phone || "");
}

function hasProductWhatsapp(product){
    return isCostaRicaWhatsapp(getProductPhone(product)) && Boolean(getProductPhone(product));
}

function getProductCategory(product){
    const raw = String(product.category || "otros").toLowerCase().trim();
    return ["camisetas", "hoodies", "pantalones", "accesorios", "otros"].includes(raw) ? raw : "otros";
}

function getProductStatus(product){
    const raw = String(product.status || "disponible").toLowerCase().trim();
    if(raw.includes("vend")) return "vendido";
    if(raw.includes("reserv")) return "reservado";
    return "disponible";
}

function formatProductStatus(product){
    const status = getProductStatus(product);
    return status.charAt(0).toUpperCase() + status.slice(1);
}

function getProductSellerId(product){
    return Number(product.user_id || product.seller_id || product.seller_user_id || 0);
}

function getProductSellerName(product){
    return product.seller_username || product.username || product.dealer_id || product.seller || "";
}

function getProductSellerAvatar(product){
    return product.seller_avatar || product.avatar || "avatar-1";
}

function isProductOwner(product, user){
    return Boolean(product && user && Number(product.user_id) === Number(user.id));
}

function setCurrentUser(user){
    currentUser = user || null;
    currentProfile = user || null;
    if(user){
        selectedAvatar = user.avatar || "avatar-1";
    }
    renderDealerProfile();
}

/* FAVORITES */
let favorites = JSON.parse(localStorage.getItem("closetFavorites") || "[]");

function saveFavorites(){
    localStorage.setItem("closetFavorites", JSON.stringify(favorites));
}

function isFavorite(productId){
    return favorites.some(f => Number(f) === Number(productId));
}

function toggleFavorite(productId){
    const idx = favorites.findIndex(f => Number(f) === Number(productId));
    if(idx >= 0){
        favorites.splice(idx, 1);
    }else{
        favorites.push(Number(productId));
    }
    saveFavorites();
    return isFavorite(productId);
}

function getFavoriteProducts(){
    return products.filter(p => isFavorite(p.id));
}

/* PROFILE TABS */
function switchProfileTab(tab){
    document.querySelectorAll(".profile-tab").forEach(t => t.classList.toggle("active", t.dataset.profileTab === tab));
    ["profileTabMyProducts", "profileTabFavorites", "profileTabSettings"].forEach(id => $(id).classList.toggle("hidden", !id.endsWith(tab === "my-products" ? "MyProducts" : tab === "favorites" ? "Favorites" : "Settings")));
    if(tab === "favorites") renderFavoritesList();
    if(tab === "settings") loadProfileSettings();
}

function renderFavoritesList(){
    const list = $("favoritesList");
    const empty = $("favoritesEmpty");
    const favProducts = getFavoriteProducts();
    list.innerHTML = "";
    if(!favProducts.length){
        empty.classList.remove("hidden");
        return;
    }
    empty.classList.add("hidden");
    favProducts.forEach(product => {
        const item = document.createElement("div");
        item.className = "my-product-card";
        item.innerHTML = `
            <div class="mini-thumb">${getProductImage(product) ? `<img src="${escapeAdminHtml(getProductImage(product))}" alt="">` : "SIN IMAGEN"}</div>
            <div><div class="mini-name">${escapeAdminHtml(getProductName(product))}</div><div class="mini-meta">${escapeAdminHtml(formatPrice(product.price))} · ${escapeAdminHtml(formatProductStatus(product))}</div></div>
        `;
        item.addEventListener("click", () => openDetail(product));
        list.appendChild(item);
    });
}

/* SETTINGS */
function loadProfileSettings(){
    const sinpe = localStorage.getItem("closetSinpe_" + (currentUser ? currentUser.id : "0")) || "";
    const waLocal = localStorage.getItem("closetWa_" + (currentUser ? currentUser.id : "0")) || "";
    const wa = waLocal || (currentUser ? (currentUser.whatsapp_phone ? normalizeWhatsappPhone(currentUser.whatsapp_phone) : "") : "");
    $("usernameInput").value = currentUser ? (currentUser.username || currentUser.dealer_id || "") : "";
    $("whatsappInput").value = wa;
    const sInput = $("profileSinpeInput");
    if(sInput) sInput.value = sinpe;
}

function saveSinpeSettings(){
    const sinpe = normalizeWhatsappPhone($("profileSinpeInput") ? $("profileSinpeInput").value : "");
    if(currentUser) localStorage.setItem("closetSinpe_" + currentUser.id, sinpe);
    return sinpe;
}

/* GALLERY */
let galleryImages = [];
let galleryIndex = 0;

function renderGalleryNav(product){
    const images = [];
    if(product.image_url) images.push(product.image_url);
    if(product.image_url_2) images.push(product.image_url_2);
    if(product.image_url_3) images.push(product.image_url_3);
    if(product.image_url_4) images.push(product.image_url_4);
    if(!images.length && product.image) images.push(product.image);
    galleryImages = images;
    galleryIndex = 0;
    const nav = $("galleryNav");
    nav.innerHTML = "";
    if(images.length <= 1){
        nav.style.display = "none";
        return;
    }
    nav.style.display = "flex";
    images.forEach((_, i) => {
        const dot = document.createElement("button");
        dot.className = "gallery-dot" + (i === 0 ? " active" : "");
        dot.addEventListener("click", () => showGalleryImage(i));
        nav.appendChild(dot);
    });
}

function showGalleryImage(index){
    if(index < 0 || index >= galleryImages.length) return;
    galleryIndex = index;
    const img = $("detailImage").querySelector("img");
    if(img){
        img.src = galleryImages[index];
        img.onerror = () => { $("detailImage").innerHTML = "SIN IMAGEN"; };
    }
    $("galleryNav").querySelectorAll(".gallery-dot").forEach((d, i) => d.classList.toggle("active", i === index));
}

function renderDealerProfile(){
    const user = currentProfile || {};
    const username = user.username || user.dealer_id || "Dealer#001";
    const avatar = user.avatar || "avatar-1";
    $("dealerName").textContent = username;
    $("feedAvatar").className = "dealer-avatar " + avatar;
    const phone = $("dealerPhone");
    if(phone){
        phone.textContent = user.whatsapp_phone ? "WhatsApp: " + formatCostaRicaPhone(user.whatsapp_phone) : "WhatsApp: sin configurar";
    }
    const adminBtn = $("adminBtn");
    if(adminBtn){
        adminBtn.classList.toggle("visible", Boolean(currentUser && currentUser.is_admin));
    }
}

function resetAuthForm(){
    $("emailInput").value = "";
    $("codeInput").value = "";
    $("confirmPasswordInput").value = "";
    $("emailCodeInput").value = "";
    $("emailCodeInput").classList.add("hidden");
    $("confirmPasswordInput").classList.remove("hidden");
    $("sendCodeBtn").textContent = "Crear cuenta";
    pendingRegisterEmail = "";
    pendingRegisterPassword = "";
    setAuthBusy(false);
}

/* DEMO MODE */
const DEMO_MODE = true;

function loadDemoData(){
    const demoUser = {
        id: 1, email: "demo@closet.elander", username: "DemoDealer",
        dealer_id: "Dealer#001", avatar: "avatar-1",
        whatsapp_phone: "50687720047", is_admin: true
    };
    setCurrentUser(demoUser);
    products = [
        { id:1, name:"Camiseta Negra Oversize", price:8500, size:"M", category:"camisetas", status:"disponible", description:"Camiseta negra algodon oversize, nueva.", uber_flash_included:true, user_id:1, seller_username:"DemoDealer", seller_whatsapp:"50687720047", avatar:"avatar-1", image_url:"" },
        { id:2, name:"Hoodie Gris Claro", price:15000, size:"L", category:"hoodies", status:"disponible", description:"Hoodie gris claro en buen estado.", uber_flash_included:false, user_id:1, seller_username:"DemoDealer", seller_whatsapp:"50687720047", avatar:"avatar-1", image_url:"" },
        { id:3, name:"Pantalon Cargo Beige", price:12000, size:"32", category:"pantalones", status:"vendido", description:"Pantalon cargo beige, usado poco.", uber_flash_included:true, user_id:2, seller_username:"Vendedor2", seller_whatsapp:"50688880000", avatar:"avatar-2", image_url:"" },
        { id:4, name:"Camiseta Blanca Basica", price:5500, size:"S", category:"camisetas", status:"disponible", description:"Camiseta blanca basica, nueva con etiqueta.", uber_flash_included:false, user_id:2, seller_username:"Vendedor2", seller_whatsapp:"50688880000", avatar:"avatar-2", image_url:"" },
        { id:5, name:"Gorra Negra", price:4500, size:"Unica", category:"accesorios", status:"disponible", description:"Gorra negra ajustable.", uber_flash_included:false, user_id:1, seller_username:"DemoDealer", seller_whatsapp:"50687720047", avatar:"avatar-1", image_url:"" },
        { id:6, name:"Hoodie Rojo", price:18000, size:"XL", category:"hoodies", status:"reservado", description:"Hoodie rojo talla XL, solo puesto una vez.", uber_flash_included:true, user_id:3, seller_username:"Vendedor3", seller_whatsapp:"50681112222", avatar:"avatar-3", image_url:"" },
    ];
    renderDealerProfile();
    filterProducts();
}

async function initializeApp(){
    try{
        const data = await api("/api/auth/me");
        setCurrentUser(data.user);
        await openFeed();
    }catch{
        if(DEMO_MODE){
            setCurrentUser({
                id: 1, email: "demo@closet.elander", username: "DemoDealer",
                dealer_id: "Dealer#001", avatar: "avatar-1",
                whatsapp_phone: "50687720047", is_admin: true
            });
            await openFeed();
            return;
        }
        localStorage.removeItem(TOKEN_KEY);
        setCurrentUser(null);
        showScreen("playScreen");
        setStatus("", "");
    }
}

async function registerUser(){
    const email = normalizeEmail($("emailInput").value);
    const password = $("codeInput").value.trim();
    const confirmPassword = $("confirmPasswordInput").value.trim();

    if(pendingRegisterEmail){
        await verifyEmailRegisterCode();
        return;
    }

    if(!isValidEmail(email)){
        setStatus("Ingresa un email valido.", "error");
        return;
    }
    if(password.length < 6){
        setStatus("La contrasena debe tener al menos 6 caracteres.", "error");
        return;
    }
    if(password !== confirmPassword){
        setStatus("Las contrasenas no coinciden.", "error");
        return;
    }
    setAuthBusy(true);
    setStatus("Enviando codigo al correo...", "");
    try{
        const data = await api("/api/auth/register/start", {
            method: "POST",
            body: JSON.stringify({ email, password, confirmPassword })
        });
        pendingRegisterEmail = email;
        pendingRegisterPassword = password;
        $("emailCodeInput").classList.remove("hidden");
        $("emailCodeInput").focus();
        $("confirmPasswordInput").classList.add("hidden");
        $("sendCodeBtn").textContent = "Confirmar correo";
        setStatus(data.message || "Revisa tu correo para confirmar.", "success");
    }catch(error){
        setStatus(error.message, "error");
    }finally{
        setAuthBusy(false);
    }
}

async function verifyEmailRegisterCode(){
    if(!pendingRegisterEmail || !pendingRegisterPassword){
        setStatus("Crea la cuenta primero.", "error");
        return;
    }

    setAuthBusy(true);
    setStatus("Confirmando correo...", "");
    try{
        const data = await api("/api/auth/register/verify", {
            method: "POST",
            body: JSON.stringify({ email: pendingRegisterEmail, password: pendingRegisterPassword })
        });
        pendingRegisterEmail = "";
        pendingRegisterPassword = "";
        setCurrentUser(data.user);
        setStatus("Correo confirmado.", "success");
        await openFeed();
    }catch(error){
        setStatus(error.message, "error");
    }finally{
        setAuthBusy(false);
    }
}

async function loginUser(){
    const email = normalizeEmail($("emailInput").value);
    const password = $("codeInput").value.trim();
    pendingRegisterEmail = "";
    pendingRegisterPassword = "";
    $("emailCodeInput").value = "";
    $("emailCodeInput").classList.add("hidden");
    $("confirmPasswordInput").classList.remove("hidden");
    $("sendCodeBtn").textContent = "Crear cuenta";

    if(!isValidEmail(email)){
        setStatus("Ingresa un email valido.", "error");
        return;
    }
    if(!password){
        setStatus("Ingresa tu contrasena.", "error");
        return;
    }
    setAuthBusy(true);
    setStatus("Entrando...", "");
    try{
        const data = await api("/api/auth/login", {
            method: "POST",
            body: JSON.stringify({ email, password })
        });
        setCurrentUser(data.user);
        setStatus("Acceso correcto.", "success");
        await openFeed();
    }catch(error){
        setStatus(error.message, "error");
    }finally{
        setAuthBusy(false);
    }
}

async function changeUser(){
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    localStorage.removeItem(TOKEN_KEY);
    setCurrentUser(null);
    products = [];
    resetAuthForm();
    showScreen("authScreen");
}

function startGame(){
    showScreen("loadingScreen");
    const progress = $("progress");
    let width = 0;
    progress.style.width = "0%";
    const interval = setInterval(async () => {
        width += 10;
        progress.style.width = width + "%";
        if(width >= 100){
            clearInterval(interval);
            if(currentUser){
                await openFeed();
            }else{
                showScreen("authScreen");
            }
        }
    }, 120);
}

async function openFeed(){
    if(!currentUser){
        showScreen("authScreen");
        return;
    }
    showScreen("feedScreen");
    renderDealerProfile();
    await loadProducts();
}

async function loadProducts(){
    const grid = $("productsGrid");
    grid.innerHTML = "<div class=\"helper-text\">Cargando prendas...</div>";
    try{
        const data = await api("/api/products");
        products = data.products || [];
        filterProducts();
    }catch(error){
        if(DEMO_MODE && !products.length){
            loadDemoData();
            return;
        }
        products = [];
        grid.innerHTML = "<div class=\"helper-text\">" + error.message + "</div>";
    }
}

function renderProducts(list){
    const grid = $("productsGrid");
    grid.innerHTML = "";
    if(!list.length){
        grid.innerHTML = "<div class=\"helper-text\">No hay prendas disponibles.</div>";
        return;
    }
    list.forEach(product => {
        const card = document.createElement("div");
        const image = getProductImage(product);
        card.className = "product-card";
        const imageBox = document.createElement("div");
        imageBox.className = "product-image";
        if(image){
            const img = document.createElement("img");
            img.src = image;
            img.alt = getProductName(product);
            img.onerror = () => {
                imageBox.innerHTML = "";
                imageBox.textContent = "SIN IMAGEN";
            };
            imageBox.appendChild(img);
        }else{
            imageBox.textContent = "SIN IMAGEN";
        }
        const name = document.createElement("div");
        name.className = "product-name";
        name.textContent = getProductName(product);
        const metaLine = document.createElement("div");
        metaLine.className = "product-meta-line";
        metaLine.textContent = "Talla " + (product.size || "N/D") + " · " + (getProductSellerName(product) || "Dealer");
        const status = document.createElement("div");
        const statusValue = getProductStatus(product);
        status.className = "product-status " + statusValue;
        status.textContent = formatProductStatus(product);
        const price = document.createElement("div");
        price.className = "product-price";
        price.textContent = formatPrice(product.price);
        card.addEventListener("click", () => openDetail(product));
        const favBtn = document.createElement("button");
        favBtn.className = "card-btn";
        favBtn.type = "button";
        favBtn.style.cssText = "position:absolute;top:6px;right:6px;padding:4px 6px;font-size:0.5rem;z-index:1;min-width:auto";
        const prodId = Number(product.id || product.product_id || 0);
        favBtn.textContent = isFavorite(prodId) ? "♥" : "♡";
        favBtn.addEventListener("click", event => {
            event.stopPropagation();
            toggleFavorite(prodId);
            favBtn.textContent = isFavorite(prodId) ? "♥" : "♡";
            renderFavoritesList();
        });
        card.style.position = "relative";
        card.appendChild(favBtn);
        const footer = document.createElement("div");
        footer.className = "product-footer";
        const buyButton = document.createElement("button");
        buyButton.className = "card-btn";
        buyButton.type = "button";
        if(hasProductWhatsapp(product)){
            buyButton.textContent = "Comprar";
            buyButton.addEventListener("click", event => {
                event.stopPropagation();
                contactProductByWhatsApp(product);
            });
        }else{
            buyButton.textContent = "Sin WhatsApp";
            buyButton.disabled = true;
            buyButton.title = "Este vendedor aun no configuro WhatsApp";
        }
        footer.appendChild(price);
        footer.appendChild(buyButton);
        card.appendChild(imageBox);
        card.appendChild(name);
        card.appendChild(metaLine);
        card.appendChild(status);
        card.appendChild(footer);
        grid.appendChild(card);
    });
}

function filterProducts(){
    const query = $("searchInput").value.trim().toLowerCase();
    const filtered = products.filter(product => {
        const matchesCategory = activeCategory === "all" || getProductCategory(product) === activeCategory;
        const text = [getProductName(product), getProductSellerName(product), getProductCategory(product), product.size, product.description].join(" ").toLowerCase();
        return matchesCategory && (!query || text.includes(query));
    });
    renderProducts(filtered);
}

function setActiveCategory(category, button){
    activeCategory = category;
    document.querySelectorAll(".category-chip").forEach(chip => chip.classList.remove("active"));
    if(button) button.classList.add("active");
    filterProducts();
}

function openDetail(product){
    activeProduct = product;
    const image = getProductImage(product);
    const detailImage = $("detailImage");
    detailImage.innerHTML = "";
    if(image){
        const img = document.createElement("img");
        img.src = image;
        img.alt = getProductName(product);
        img.onerror = () => {
            detailImage.innerHTML = "";
            detailImage.textContent = "SIN IMAGEN";
        };
        detailImage.appendChild(img);
    }else{
        detailImage.textContent = "SIN IMAGEN";
    }
    $("detailName").textContent = getProductName(product);
    $("detailPrice").textContent = formatPrice(product.price);
    $("detailDescription").textContent = product.description || "Sin descripcion.";
    $("detailSize").textContent = product.size ? "Talla: " + product.size : "Talla: No indicada";
    $("detailShipping").textContent = product.uber_flash_included ? "Uber Flash: Si" : "Uber Flash: No";
    $("detailStatus").textContent = "Estado: " + formatProductStatus(product);
    $("detailSeller").innerHTML = `
        <div class="dealer-avatar ${getProductSellerAvatar(product)}"></div>
        <div>
            <div class="seller-name">${escapeAdminHtml(getProductSellerName(product) || "Dealer no disponible")}</div>
            <div class="seller-meta">${hasProductWhatsapp(product) ? "WhatsApp disponible" : "Este vendedor aún no agregó WhatsApp"}</div>
        </div>
        <button class="card-btn" id="sellerProfileBtn" type="button">Ver perfil</button>
    `;
    $("sellerProfileBtn").addEventListener("click", openSellerProfileFromDetail);
    renderGalleryNav(product);
    const prodId = Number(product.id || product.product_id || 0);
    const detailFav = $("detailFavBtn");
    detailFav.textContent = isFavorite(prodId) ? "♥ Favorito" : "♡ Favorito";
    detailFav.onclick = () => {
        toggleFavorite(prodId);
        detailFav.textContent = isFavorite(prodId) ? "♥ Favorito" : "♡ Favorito";
        renderFavoritesList();
    };
    if(hasProductWhatsapp(product)){
        $("whatsappBtn").disabled = false;
        $("whatsappBtn").textContent = "Comprar";
        $("whatsappBtn").title = "";
    }else{
        $("whatsappBtn").disabled = true;
        $("whatsappBtn").textContent = "Sin WhatsApp";
        $("whatsappBtn").title = "Este vendedor aun no configuro WhatsApp";
    }
    showScreen("detailScreen");
}

function openProfile(tab){
    if(!currentUser) return showScreen("authScreen");
    selectedAvatar = currentUser.avatar || "avatar-1";
    $("profileDealerId").textContent = currentUser.dealer_id || "Dealer#001";
    $("profilePhone").textContent = "WhatsApp: " + formatCostaRicaPhone(currentUser.whatsapp_phone);
    $("profileUsernameText").textContent = currentUser.username || currentUser.dealer_id;
    loadMyProducts();
    loadProfileSettings();
    setSelectedAvatar(selectedAvatar);
    setProfileStatus("", "");
    switchProfileTab(tab || "my-products");
    showScreen("profileScreen");
}

function setSelectedAvatar(avatar){
    selectedAvatar = avatar || "avatar-1";
    $("profileAvatarPreview").className = "profile-avatar " + selectedAvatar;
    document.querySelectorAll(".avatar-option").forEach(option => {
        option.classList.toggle("active", option.dataset.avatar === selectedAvatar);
    });
}

async function saveProfileChanges(){
    const username = $("usernameInput").value.trim().replace(/\s+/g, " ");
    const whatsappPhone = normalizeWhatsappPhone($("whatsappInput").value);
    if(username.length < 3){
        setProfileStatus("El username debe tener al menos 3 caracteres.", "error");
        return;
    }
    if(!isCostaRicaWhatsapp(whatsappPhone)){
        setProfileStatus("WhatsApp debe ser un numero de Costa Rica de 8 digitos.", "error");
        return;
    }
    saveSinpeSettings();
    try{
        const data = await api("/api/users/me", {
            method: "PATCH",
            body: JSON.stringify({ username, avatar: selectedAvatar, whatsapp_phone: whatsappPhone })
        });
        setCurrentUser(data.user);
        openProfile("settings");
        setProfileStatus("Cambios guardados.", "success");
    }catch(error){
        setProfileStatus(error.message, "error");
    }
}

function openUploadProduct(){
    $("editingProductId").value = "";
    clearProductForm();
    $("publishProductBtn").textContent = "Publicar prenda";
    $("uploadAvatarPreview").className = "profile-avatar " + (currentUser.avatar || "avatar-1");
    $("uploadSellerName").textContent = currentUser.username || currentUser.dealer_id;
    setPublishStatus("", "");
    showScreen("uploadProductScreen");
}

function clearProductForm(){
    $("editingProductId").value = "";
    $("productNameInput").value = "";
    $("productPriceInput").value = "";
    $("productSizeInput").value = "";
    $("productCategoryInput").value = "otros";
    $("productStatusInput").value = "disponible";
    $("productDescriptionInput").value = "";
    clearProductImageInput();
    $("uberIncludedInput").checked = false;
}

function getProductImageInput(){
    return $("productImage");
}

function clearProductImageInput(){
    const input = getProductImageInput();
    if(!input){
        return;
    }
    const cleanInput = input.cloneNode(true);
    input.replaceWith(cleanInput);
}

function validateProductForm(isEdit){
    const imageInput = getProductImageInput();
    const image = imageInput && imageInput.files ? imageInput.files[0] : null;
    if(!isEdit && !image) return "La imagen es obligatoria.";
    if(image && !image.type.startsWith("image/")) return "El archivo debe ser una imagen.";
    if(!$("productNameInput").value.trim()) return "El nombre es obligatorio.";
    if(Number($("productPriceInput").value) <= 0) return "El precio debe ser mayor a 0.";
    if(!$("productSizeInput").value.trim()) return "La talla es obligatoria.";
    if(!$("productDescriptionInput").value.trim()) return "La descripcion es obligatoria.";
    return "";
}

async function uploadSelectedImage(){
    const imageInput = getProductImageInput();
    const image = imageInput && imageInput.files ? imageInput.files[0] : null;
    if(!image){
        throw new Error("Selecciona una imagen.");
    }
    const form = new FormData();
    form.append("image", image);
    try{
        return await uploadApi("/api/uploads", form);
    }catch(error){
        throw new Error("No se pudo subir imagen: " + error.message);
    }
}

async function publishProduct(){
    if(!currentUser){
        setPublishStatus("No estas logeado. Entra de nuevo.", "error");
        showScreen("authScreen");
        return;
    }

    const editingProductId = $("editingProductId").value;
    const error = validateProductForm(Boolean(editingProductId));
    if(error){
        setPublishStatus(error, "error");
        return;
    }
    $("publishProductBtn").disabled = true;
    try{
        setPublishStatus("Subiendo imagen...", "");
        const upload = await uploadSelectedImage();
        setPublishStatus("Guardando prenda...", "");
        const payload = {
            name: $("productNameInput").value.trim(),
            price: Number($("productPriceInput").value),
            size: $("productSizeInput").value.trim(),
            category: $("productCategoryInput").value,
            status: $("productStatusInput").value,
            description: $("productDescriptionInput").value.trim(),
            uber_flash_included: $("uberIncludedInput").checked,
            image_url: upload.imageUrl || upload.image_url || "",
            storage_path: upload.storage_path || ""
        };
        if(editingProductId){
            try{
                await api("/api/products/" + editingProductId, { method: "PATCH", body: JSON.stringify(payload) });
            }catch(error){
                throw new Error("No se pudo crear producto: " + error.message);
            }
        }else{
            try{
                await api("/api/products", { method: "POST", body: JSON.stringify(payload) });
            }catch(error){
                throw new Error("No se pudo crear producto: " + error.message);
            }
        }
        clearProductForm();
        setPublishStatus(editingProductId ? "Prenda actualizada." : "Prenda publicada.", "success");
        await loadProducts();
        await loadMyProducts();
        showScreen(editingProductId ? "profileScreen" : "feedScreen");
    }catch(err){
        setPublishStatus(err.message, "error");
    }finally{
        $("publishProductBtn").disabled = false;
    }
}

function renderMiniProducts(targetId, list){
    const target = $(targetId);
    target.innerHTML = "";
    if(!list || !list.length){
        target.innerHTML = "<div class=\"helper-text\">No hay prendas publicadas.</div>";
        return;
    }
    list.forEach(product => {
        const item = document.createElement("div");
        item.className = "mini-product";
        item.innerHTML = `
            <div class="mini-thumb">${getProductImage(product) ? `<img src="${escapeAdminHtml(getProductImage(product))}" alt="">` : "SIN IMAGEN"}</div>
            <div><div class="mini-name">${escapeAdminHtml(getProductName(product))}</div><div class="mini-meta">${escapeAdminHtml(formatPrice(product.price))} · ${escapeAdminHtml(formatProductStatus(product))}</div></div>
        `;
        target.appendChild(item);
    });
}

function renderMyProducts(list){
    const target = $("myProductsList");
    target.innerHTML = "";
    if(!list || !list.length){
        target.innerHTML = "<div class=\"helper-text\">No has publicado prendas todavia.</div>";
        return;
    }
    list.forEach(product => {
        const item = document.createElement("div");
        item.className = "my-product-card";
        item.innerHTML = `
            <div class="mini-thumb">${getProductImage(product) ? `<img src="${escapeAdminHtml(getProductImage(product))}" alt="">` : "SIN IMAGEN"}</div>
            <div><div class="mini-name">${escapeAdminHtml(getProductName(product))}</div><div class="mini-meta">${escapeAdminHtml(formatPrice(product.price))} · Talla ${escapeAdminHtml(product.size || "N/D")} · ${escapeAdminHtml(formatProductStatus(product))}</div></div>
            <div class="my-product-actions"></div>
        `;
        const actions = item.querySelector(".my-product-actions");
        const viewBtn = document.createElement("button");
        viewBtn.className = "card-btn";
        viewBtn.type = "button";
        viewBtn.textContent = "Ver detalle";
        viewBtn.addEventListener("click", () => openDetail(product));
        actions.appendChild(viewBtn);
        if(isProductOwner(product, currentUser)){
            const editBtn = document.createElement("button");
            editBtn.className = "card-btn";
            editBtn.type = "button";
            editBtn.textContent = "Editar";
            editBtn.addEventListener("click", () => editMyProduct(product));
            const deleteBtn = document.createElement("button");
            deleteBtn.className = "card-btn danger-btn";
            deleteBtn.type = "button";
            deleteBtn.textContent = "Eliminar";
            deleteBtn.addEventListener("click", () => deleteMyProduct(product));
            actions.appendChild(editBtn);
            actions.appendChild(deleteBtn);
        }
        target.appendChild(item);
    });
}

async function openSettingsScreen(){
    if(!currentUser) return showScreen("authScreen");
    $("settingsAvatar").className = "profile-avatar " + (currentUser.avatar || "avatar-1");
    $("settingsEmail").textContent = currentUser.email || "";
    $("settingsEmailValue").textContent = currentUser.email || "—";
    $("settingsDealerId").textContent = currentUser.dealer_id || "—";
    $("settingsUsername").textContent = currentUser.username || currentUser.dealer_id || "—";
    const sinpe = localStorage.getItem("closetSinpe_" + (currentUser ? currentUser.id : "0")) || "";
    const wa = localStorage.getItem("closetWa_" + (currentUser ? currentUser.id : "0")) || normalizeWhatsappPhone(currentUser.whatsapp_phone || "");
    if($("settingsSinpeInput")) $("settingsSinpeInput").value = sinpe;
    if($("settingsWhatsappInput")) $("settingsWhatsappInput").value = wa;
    $("settingsSinpeStatus").textContent = "";
    $("settingsWhatsappStatus").textContent = "";
    showScreen("settingsScreen");
}

function loadMyProducts(){
    const mine = products.filter(product => isProductOwner(product, currentUser));
    renderMyProducts(mine);
    const total = mine.length;
    const sold = mine.filter(p => getProductStatus(p) === "vendido").length;
    const favCount = getFavoriteProducts().length;
    $("profilePublishedCount").textContent = total;
    $("profileSoldCount").textContent = sold;
    $("profileFavoritesCount").textContent = favCount;
}

function editMyProduct(product){
    if(!isProductOwner(product, currentUser)){
        setProfileStatus("No puedes editar una prenda que no es tuya.", "error");
        return;
    }
    $("editingProductId").value = product.id || "";
    $("productNameInput").value = getProductName(product);
    $("productPriceInput").value = Number(product.price || 0);
    $("productSizeInput").value = product.size || "";
    $("productCategoryInput").value = getProductCategory(product);
    $("productStatusInput").value = getProductStatus(product);
    $("productDescriptionInput").value = product.description || "";
    clearProductImageInput();
    $("uberIncludedInput").checked = Boolean(product.uber_flash_included);
    $("publishProductBtn").textContent = "Guardar edicion";
    setPublishStatus("Puedes cambiar la imagen o dejar la actual.", "");
    showScreen("uploadProductScreen");
}

async function deleteMyProduct(product){
    if(!isProductOwner(product, currentUser)) return;
    if(!confirm("Eliminar esta prenda? Esta accion no se puede deshacer.")) return;
    try{
        await api("/api/products/" + product.id, { method: "DELETE" });
        setProfileStatus("Prenda eliminada.", "success");
        await loadProducts();
        await loadMyProducts();
    }catch(error){
        setProfileStatus(error.message, "error");
    }
}

function renderDealerResults(list){
    const target = $("dealerResults");
    target.innerHTML = "";
    if(!list.length){
        target.innerHTML = "<div class=\"helper-text\">Sin resultados.</div>";
        return;
    }
    list.forEach(profile => {
        const row = document.createElement("div");
        row.className = "dealer-result";
        row.innerHTML = `
            <div class="dealer-avatar ${escapeAdminHtml(profile.avatar || "avatar-1")}"></div>
            <div><div class="mini-name">${escapeAdminHtml(profile.username || profile.dealer_id)}</div><div class="mini-meta">${escapeAdminHtml(profile.dealer_id || "")}</div></div>
            <button class="card-btn" type="button">Ver</button>
        `;
        row.querySelector("button").addEventListener("click", () => openPublicProfile(profile));
        target.appendChild(row);
    });
}

async function searchDealers(){
    const query = $("dealerSearchInput").value.trim();
    if(!query){
        $("dealerResults").innerHTML = "";
        return;
    }
    try{
        const data = await api("/api/users/search?q=" + encodeURIComponent(query));
        renderDealerResults(data.users || []);
    }catch(error){
        $("dealerResults").innerHTML = "<div class=\"helper-text\">" + error.message + "</div>";
    }
}

async function openPublicProfile(profile){
    $("publicProfileAvatar").className = "profile-avatar " + (profile.avatar || "avatar-1");
    $("publicProfileName").textContent = profile.username || profile.dealer_id;
    $("publicProfileDealerId").textContent = profile.dealer_id || "";
    $("publicProductsList").innerHTML = "<div class=\"helper-text\">Cargando prendas...</div>";
    showScreen("publicProfileScreen");
    try{
        const data = await api("/api/users/" + profile.id);
        renderMiniProducts("publicProductsList", data.products || []);
    }catch(error){
        $("publicProductsList").innerHTML = "<div class=\"helper-text\">" + error.message + "</div>";
    }
}

async function getSellerProfileFromProduct(product){
    return {
        id: product.user_id,
        phone: getProductPhone(product),
        username: getProductSellerName(product),
        dealer_id: product.dealer_id || getProductSellerName(product),
        avatar: getProductSellerAvatar(product)
    };
}

async function loadProductsForSeller(profile){
    const data = await api("/api/users/" + profile.id);
    return data.products || [];
}

function renderClickableSellerProducts(targetId, list){
    const target = $(targetId);
    target.innerHTML = "";
    if(!list || !list.length){
        target.innerHTML = "<div class=\"helper-text\">No hay prendas publicadas.</div>";
        return;
    }
    list.forEach(product => {
        const card = document.createElement("div");
        card.className = "mini-product";
        card.innerHTML = `
            <div class="mini-thumb">${getProductImage(product) ? `<img src="${escapeAdminHtml(getProductImage(product))}" alt="">` : "SIN IMAGEN"}</div>
            <div><div class="mini-name">${escapeAdminHtml(getProductName(product))}</div><div class="mini-meta">${escapeAdminHtml(formatPrice(product.price))} · ${escapeAdminHtml(formatProductStatus(product))}</div></div>
        `;
        card.addEventListener("click", () => openDetail(product));
        target.appendChild(card);
    });
}

async function openSellerProfileFromDetail(){
    if(!activeProduct) return;
    sellerProfileSourceProduct = activeProduct;
    const profile = await getSellerProfileFromProduct(activeProduct);
    $("sellerProfileAvatar").className = "profile-avatar " + (profile.avatar || "avatar-1");
    $("sellerProfileName").textContent = profile.username || profile.dealer_id;
    $("sellerProfileDealerId").textContent = profile.dealer_id || "";
    $("sellerProductsList").innerHTML = "<div class=\"helper-text\">Cargando prendas...</div>";
    showScreen("sellerProfileScreen");
    try{
        const sellerProducts = await loadProductsForSeller(profile);
        $("sellerProductCount").textContent = sellerProducts.length + (sellerProducts.length === 1 ? " prenda publicada" : " prendas publicadas");
        renderClickableSellerProducts("sellerProductsList", sellerProducts);
    }catch(error){
        $("sellerProductsList").innerHTML = "<div class=\"helper-text\">" + error.message + "</div>";
    }
}

function backToSellerSourceProduct(){
    if(sellerProfileSourceProduct){
        openDetail(sellerProfileSourceProduct);
        return;
    }
    showScreen("detailScreen");
}

function getAdminProductSeller(product){
    return getProductSellerName(product) || product.seller_phone || product.phone || product.user_id || "-";
}

async function openAdminPanel(){
    if(!currentUser || !currentUser.is_admin){
        showScreen("adminScreen");
        setAdminStatus("Acceso denegado.", "error");
        return;
    }
    $("adminPhoneText").textContent = "Admin: " + (currentUser.email || currentUser.username);
    showScreen("adminScreen");
    await loadAdminDashboard();
}

async function loadAdminDashboard(){
    if(!currentUser || !currentUser.is_admin){
        setAdminStatus("Acceso denegado.", "error");
        return;
    }
    setAdminStatus("Cargando datos...", "");
    try{
        const data = await api("/api/admin/dashboard");
        $("adminTotalUsers").textContent = data.stats.users || 0;
        $("adminTotalProducts").textContent = data.stats.products || 0;
        adminUsers = data.users || [];
        adminProducts = data.products || [];
        renderAdminDashboard();
        setAdminStatus("Datos actualizados.", "success");
    }catch(error){
        setAdminStatus(error.message, "error");
    }
}

function renderAdminDashboard(){
    renderAdminLatestUsers();
    renderAdminLatestProducts();
    renderAdminUsers();
    renderAdminProducts();
}

function adminEmptyRow(colspan){
    return `<tr><td colspan="${colspan}" class="admin-muted">Sin datos</td></tr>`;
}

function renderAdminLatestUsers(){
    $("adminLatestUsersBody").innerHTML = adminUsers.slice(0, 5).map(user => `
        <tr><td>${escapeAdminHtml(user.email || "-")}</td><td>${escapeAdminHtml(user.username)}</td><td>${escapeAdminHtml(user.dealer_id)}</td><td>${escapeAdminHtml(formatAdminDate(user.created_at))}</td></tr>
    `).join("") || adminEmptyRow(4);
}

function renderAdminLatestProducts(){
    $("adminLatestProductsBody").innerHTML = adminProducts.slice(0, 5).map(product => `
        <tr><td>${escapeAdminHtml(getProductName(product))}</td><td>${escapeAdminHtml(formatPrice(product.price))}</td><td>${escapeAdminHtml(getAdminProductSeller(product))}</td><td>${escapeAdminHtml(formatAdminDate(product.created_at))}</td></tr>
    `).join("") || adminEmptyRow(4);
}

function renderAdminUsers(){
    $("adminUsersBody").innerHTML = adminUsers.map(user => `
        <tr>
            <td><div class="admin-thumb ${escapeAdminHtml(user.avatar || "avatar-1")}"></div></td>
            <td>${escapeAdminHtml(user.email || "-")}</td>
            <td>${escapeAdminHtml(user.username)}</td>
            <td>${escapeAdminHtml(user.dealer_id)}</td>
            <td>${escapeAdminHtml(formatAdminDate(user.created_at))}</td>
            <td><div class="admin-action-list">
                <button class="small-btn admin-warn" data-admin-action="ban-user" data-user-id="${user.id}">${user.banned ? "Banneado" : "Bannear"}</button>
                <button class="small-btn admin-danger" data-admin-action="delete-profile" data-user-id="${user.id}">Eliminar cuenta</button>
            </div></td>
        </tr>
    `).join("") || adminEmptyRow(6);
}

function renderAdminProducts(){
    $("adminProductsBody").innerHTML = adminProducts.map(product => {
        const image = getProductImage(product);
        return `
            <tr>
                <td>${image ? `<img class="admin-thumb" src="${escapeAdminHtml(image)}" alt="">` : "-"}</td>
                <td>${escapeAdminHtml(getProductName(product))}</td>
                <td>${escapeAdminHtml(formatPrice(product.price))}</td>
                <td>${escapeAdminHtml(getAdminProductSeller(product))}</td>
                <td><button class="small-btn admin-danger" data-admin-action="delete-product" data-product-id="${product.id}">Eliminar prenda</button></td>
            </tr>
        `;
    }).join("") || adminEmptyRow(5);
}



async function banAdminUser(userId){
    const profile = adminUsers.find(user => Number(user.id) === Number(userId));
    if(!profile || !confirm("Bannear usuario " + (profile.email || profile.username) + "?")){
        return;
    }
    try{
        await api("/api/admin/users/" + userId + "/ban", { method: "POST" });
        setAdminStatus("Usuario banneado.", "success");
        await loadAdminDashboard();
    }catch(error){
        setAdminStatus(error.message, "error");
    }
}

async function deleteAdminProfile(userId){
    if(!confirm("Eliminar esta cuenta y sus prendas? Esta accion no se puede deshacer.")){
        return;
    }
    try{
        await api("/api/admin/users/" + userId, { method: "DELETE" });
        setAdminStatus("Cuenta eliminada.", "success");
        await loadAdminDashboard();
        await loadProducts();
    }catch(error){
        setAdminStatus(error.message, "error");
    }
}

async function deleteAdminProduct(productId){
    if(!confirm("Eliminar esta prenda?")){
        return;
    }
    try{
        await api("/api/products/" + productId, { method: "DELETE" });
        setAdminStatus("Prenda eliminada.", "success");
        await loadAdminDashboard();
        await loadProducts();
    }catch(error){
        setAdminStatus(error.message, "error");
    }
}

function contactProductByWhatsApp(product){
    const phone = getProductPhone(product);
    if(!isCostaRicaWhatsapp(phone) || !phone){
        alert("Este vendedor aun no configuro WhatsApp de contacto.");
        return;
    }
    const name = encodeURIComponent(getProductName(product));
    const message = "Hola,%20quiero%20comprar%20esta%20prenda:%20" + name;
    window.open("https://wa.me/" + phone + "?text=" + message, "_blank");
}

function contactByWhatsApp(){
    if(!activeProduct) return;
    contactProductByWhatsApp(activeProduct);
}

let deferredInstallPrompt = null;

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  const btn = $("installBtn");
  if (btn) btn.style.display = "";
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  const btn = $("installBtn");
  if (btn) btn.style.display = "none";
});

function bindEvents(){
    const installBtn = $("installBtn");
    if(installBtn){
        installBtn.addEventListener("click", async () => {
            if(!deferredInstallPrompt) return;
            deferredInstallPrompt.prompt();
            const result = await deferredInstallPrompt.userChoice;
            if(result.outcome === "accepted"){
                installBtn.style.display = "none";
            }
            deferredInstallPrompt = null;
        });
    }
    $("playBtn").addEventListener("click", startGame);
    $("emailInput").addEventListener("input", event => {
        event.target.value = event.target.value.trim();
    });
    $("emailCodeInput").addEventListener("input", event => {
        event.target.value = String(event.target.value || "").replace(/\D/g, "").slice(0, 6);
    });
    $("whatsappInput").addEventListener("input", event => {
        event.target.value = event.target.value.replace(/[^\d+]/g, "").slice(0, 12);
    });
    $("sendCodeBtn").addEventListener("click", registerUser);
    $("enterBtn").addEventListener("click", loginUser);
    $("searchInput").addEventListener("input", filterProducts);
    $("backToFeedBtn").addEventListener("click", () => showScreen("feedScreen"));
    $("whatsappBtn").addEventListener("click", contactByWhatsApp);
    $("adminBtn").addEventListener("click", openAdminPanel);
    $("adminRefreshBtn").addEventListener("click", loadAdminDashboard);
    $("adminBackBtn").addEventListener("click", () => showScreen("feedScreen"));
    $("profileBtn").addEventListener("click", () => openProfile());
    $("feedSettingsBtn").addEventListener("click", openSettingsScreen);
    $("feedChangeUserBtn").addEventListener("click", changeUser);
    $("saveProfileBtn").addEventListener("click", saveProfileChanges);
    $("backProfileBtn").addEventListener("click", () => showScreen("feedScreen"));
    $("changeUserBtn").addEventListener("click", changeUser);
    $("openUploadBtn").addEventListener("click", openUploadProduct);
    $("publishProductBtn").addEventListener("click", publishProduct);
    $("backUploadProfileBtn").addEventListener("click", openProfile);
    $("dealerSearchInput").addEventListener("input", searchDealers);
    $("backPublicProfileBtn").addEventListener("click", openProfile);
    $("backSellerToProductBtn").addEventListener("click", backToSellerSourceProduct);
    $("backSellerToFeedBtn").addEventListener("click", () => showScreen("feedScreen"));
    $("filterBtn").addEventListener("click", () => $("searchInput").focus());
    document.querySelectorAll(".avatar-option").forEach(option => {
        option.addEventListener("click", () => setSelectedAvatar(option.dataset.avatar));
    });
    document.querySelectorAll(".category-chip").forEach(chip => {
        chip.addEventListener("click", () => setActiveCategory(chip.dataset.category, chip));
    });
    document.querySelectorAll(".profile-tab").forEach(tab => {
        tab.addEventListener("click", () => switchProfileTab(tab.dataset.profileTab));
    });
    const sinpeInput = $("profileSinpeInput");
    if(sinpeInput){
        sinpeInput.addEventListener("input", event => {
            event.target.value = event.target.value.replace(/[^\d+]/g, "").slice(0, 12);
        });
    }
    const settingsSinpe = $("settingsSinpeInput");
    if(settingsSinpe){
        settingsSinpe.addEventListener("input", event => {
            event.target.value = event.target.value.replace(/[^\d+]/g, "").slice(0, 12);
        });
    }
    const settingsWa = $("settingsWhatsappInput");
    if(settingsWa){
        settingsWa.addEventListener("input", event => {
            event.target.value = event.target.value.replace(/[^\d+]/g, "").slice(0, 12);
        });
    }
    const saveSettings = $("saveSettingsBtn");
    if(saveSettings){
        saveSettings.addEventListener("click", () => {
            const sInput = $("settingsSinpeInput");
            const wInput = $("settingsWhatsappInput");
            if(sInput) localStorage.setItem("closetSinpe_" + (currentUser ? currentUser.id : "0"), normalizeWhatsappPhone(sInput.value));
            if(wInput){
                const wa = normalizeWhatsappPhone(wInput.value);
                if(wa && isCostaRicaWhatsapp(wa)){
                    localStorage.setItem("closetWa_" + (currentUser ? currentUser.id : "0"), wa);
                    $("settingsWhatsappStatus").textContent = "WhatsApp guardado localmente.";
                    $("settingsWhatsappStatus").className = "profile-status success";
                }else if(!wa){
                    $("settingsWhatsappStatus").textContent = "";
                }else{
                    $("settingsWhatsappStatus").textContent = "WhatsApp debe ser 8 digitos de CR.";
                    $("settingsWhatsappStatus").className = "profile-status error";
                }
            }
            if(sInput){
                $("settingsSinpeStatus").textContent = "SINPE guardado.";
                $("settingsSinpeStatus").className = "profile-status success";
            }
        });
    }
    const backSettings = $("backSettingsBtn");
    if(backSettings) backSettings.addEventListener("click", () => showScreen("feedScreen"));
    $("adminUsersBody").addEventListener("click", event => {
        const button = event.target.closest("button[data-admin-action]");
        if(!button) return;
        if(button.dataset.adminAction === "ban-user") banAdminUser(button.dataset.userId);
        if(button.dataset.adminAction === "delete-profile") deleteAdminProfile(button.dataset.userId);
    });
    $("adminProductsBody").addEventListener("click", event => {
        const button = event.target.closest("button[data-admin-action='delete-product']");
        if(button) deleteAdminProduct(button.dataset.productId);
    });
}

bindEvents();
initializeApp();
