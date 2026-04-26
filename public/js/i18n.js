/* ============================== */
/* INTERNATIONALIZATION (EN / PT) */
/* ============================== */
(function() {
var translations = {
  en: {
    // --- Public site ---
    'get_to_know_us': 'Get to know us',
    'about_us': 'About Us',
    'what_we_offer': 'What we offer',
    'services': 'Services',
    'trusted_by': 'Trusted by',
    'partners': 'Partners',
    'our_work': 'Our work',
    'gallery': 'Gallery',
    'contact': 'Contact',
    'follow_us': 'Follow Us',

    // Bookings page
    'schedule_visit': 'Schedule your visit',
    'book_appointment': 'Book an Appointment',
    'step1_service': '1. Choose a Service',
    'step2_date': '2. Pick a Date',
    'step3_time': '3. Choose a Time',
    'step4_details': '4. Your Details',
    'no_slots': 'No available slots for this date.',
    'name': 'Name',
    'your_name': 'Your name',
    'phone': 'Phone',
    'your_phone': 'Your phone number',
    'booking_summary': 'Booking Summary',
    'service_label': 'Service:',
    'date_label': 'Date:',
    'time_label': 'Time:',
    'name_label': 'Name:',
    'phone_label': 'Phone:',
    'back': 'Back',
    'next': 'Next',
    'booking_confirmed': 'Booking Confirmed!',
    'book_another': 'Book Another',
    'review_booking': 'Review Booking',
    'confirm_booking': 'Confirm Booking',
    'booking_loading': 'Booking...',
    'something_wrong': 'Something went wrong',
    'network_error': 'Network error. Please try again.',
    'min': 'min',
    'on': ' on ',
    'at': ' at ',

    // Calendar
    'mon': 'Mon',
    'tue': 'Tue',
    'wed': 'Wed',
    'thu': 'Thu',
    'fri': 'Fri',
    'sat': 'Sat',
    'sun': 'Sun',
    'months': [
      'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
      'September', 'October', 'November', 'December'
    ],
    'months_short': [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct',
      'Nov', 'Dec'
    ],

    // Nav fallbacks
    'nav_home': 'Home',
    'nav_about': 'About',
    'nav_services': 'Services',
    'nav_partners': 'Partners',
    'nav_gallery': 'Gallery',
    'nav_bookings': 'Bookings',

    // --- Admin ---
    'admin': 'Admin',
    'employee': 'Employee',
    'bookings_page': 'Bookings',
    'users_page': 'Users',
    'settings_page': 'Settings',
    'view_site': 'View Site',
    'logout': 'Logout',
    'add_booking': 'Add Booking',
    'edit_booking': 'Edit Booking',
    'today': 'Today',
    'change_password': 'Change Password',
    'current_password': 'Current Password',
    'new_password': 'New Password',
    'update_password': 'Update Password',
    'service': 'Service',
    'date': 'Date',
    'time': 'Time',
    'customer_name': 'Customer Name',
    'name_or_walkin': 'Name or Walk-in',
    'phone_number': 'Phone number',
    'notes': 'Notes',
    'optional_notes': 'Optional notes',
    'delete': 'Delete',
    'cancel': 'Cancel',
    'save': 'Save',
    'add_user': 'Add User',
    'username': 'Username',
    'role': 'Role',
    'created': 'Created',
    'eg_john': 'e.g. john',
    'password': 'Password',
    'min_6_chars': 'Min 6 characters',
    'create_user': 'Create User',
    'no_bookings_hint':
        'No bookings for this day. Click a time slot or use "Add Booking" to create one.',
    'walkin': 'Walk-in',
    'error_saving': 'Error saving booking',
    'capacity_full':
        'All staff are occupied at this time. Choose a different time.',
    'delete_booking_confirm': 'Delete this booking?',
    'password_updated': 'Password updated successfully',
    'error': 'Error',
    'delete_user_confirm': 'Delete user "{name}"? This cannot be undone.',
    'error_deleting_user': 'Error deleting user',
    'error_creating_user': 'Error creating user',
    'day_names_full': [
      'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
      'Sunday'
    ],

    // Vacations
    'vacations_page': 'Vacations',
    'vacation_days': 'Vacation Days',
    'vac_total': 'Total',
    'vac_used': 'Used',
    'vac_booked': 'Booked',
    'vac_remaining': 'Remaining',
    'vac_change': 'change',
    'vac_changes': 'changes',

    // Login
    'admin_panel': 'Admin Panel',
    'sign_in_subtitle': 'Sign in to manage your business',
    'sign_in': 'Sign In',

    // Content Management
    'content_page': 'Content',
    'cnt_company_info': 'Company Info',
    'cnt_about': 'About',
    'cnt_services': 'Services',
    'cnt_gallery': 'Gallery',
    'cnt_carousel': 'Carousel',
    'cnt_about_images': 'About Images',
    'cnt_partners': 'Partners',
    'cnt_logo': 'Logo',
    'cnt_company_name': 'Company Name',
    'cnt_email': 'Email',
    'cnt_phone': 'Phone(s)',
    'cnt_address': 'Address',
    'cnt_schedule': 'Schedule',
    'cnt_slogan': 'Slogan',
    'cnt_slogan_sub': 'Slogan Subtitle',
    'cnt_disclaimer': 'Disclaimer / Footer',
    'cnt_add_text': 'Add Text',
    'cnt_add_service': 'Add Service',
    'cnt_about_placeholder': 'Enter about us text...',
    'cnt_svc_title': 'Title',
    'cnt_svc_desc': 'Description',
    'cnt_svc_price': 'Price',
    'cnt_upload': 'Upload Images',
    'cnt_upload_logo': 'Upload Logo',
    'cnt_upload_hint_gallery': 'Max 50 images, 5MB each',
    'cnt_upload_hint_carousel': 'Max 10 images, 5MB each',
    'cnt_upload_hint_about': 'Max 10 images, 5MB each',
    'cnt_upload_hint_partners': 'Max 20 images, 2MB each',
    'cnt_upload_hint_logo': '1 image, max 2MB. Replaces existing.',
    'cnt_img_desc': 'Description...',
    'cnt_save_descriptions': 'Save Descriptions',
    'cnt_delete_image': 'Delete this image?',
    'cnt_saved': 'Saved!',
    'cnt_deleted': 'Deleted',
    'cnt_uploaded': 'Uploaded!',
    'cnt_fill_required': 'Please fill in all required fields.'
  },
  pt: {
    // --- Public site ---
    'get_to_know_us': 'Conheça-nos',
    'about_us': 'Sobre Nós',
    'what_we_offer': 'O que oferecemos',
    'services': 'Serviços',
    'trusted_by': 'Parceiros de confiança',
    'partners': 'Parceiros',
    'our_work': 'O nosso trabalho',
    'gallery': 'Galeria',
    'contact': 'Contacto',
    'follow_us': 'Siga-nos',

    // Bookings page
    'schedule_visit': 'Agende a sua visita',
    'book_appointment': 'Marcar Serviço',
    'step1_service': '1. Escolha um Serviço',
    'step2_date': '2. Escolha uma Data',
    'step3_time': '3. Escolha um Horário',
    'step4_details': '4. Os seus Dados',
    'no_slots': 'Sem horários disponíveis para esta data.',
    'name': 'Nome',
    'your_name': 'O seu nome',
    'phone': 'Telefone',
    'your_phone': 'O seu número de telefone',
    'booking_summary': 'Resumo da Marcação',
    'service_label': 'Serviço:',
    'date_label': 'Data:',
    'time_label': 'Hora:',
    'name_label': 'Nome:',
    'phone_label': 'Telefone:',
    'back': 'Voltar',
    'next': 'Seguinte',
    'booking_confirmed': 'Marcação Confirmada!',
    'book_another': 'Nova Marcação',
    'review_booking': 'Rever Marcação',
    'confirm_booking': 'Confirmar Marcação',
    'booking_loading': 'A marcar...',
    'something_wrong': 'Algo correu mal',
    'network_error': 'Erro de rede. Tente novamente.',
    'min': 'min',
    'on': ' em ',
    'at': ' às ',

    // Calendar
    'mon': 'Seg',
    'tue': 'Ter',
    'wed': 'Qua',
    'thu': 'Qui',
    'fri': 'Sex',
    'sat': 'Sáb',
    'sun': 'Dom',
    'months': [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho',
      'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ],
    'months_short': [
      'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out',
      'Nov', 'Dez'
    ],

    // Nav fallbacks
    'nav_home': 'Início',
    'nav_about': 'Sobre',
    'nav_services': 'Serviços',
    'nav_partners': 'Parceiros',
    'nav_gallery': 'Galeria',
    'nav_bookings': 'Marcações',

    // --- Admin ---
    'admin': 'Admin',
    'employee': 'Funcionário',
    'bookings_page': 'Marcações',
    'users_page': 'Utilizadores',
    'settings_page': 'Definições',
    'view_site': 'Ver Site',
    'logout': 'Sair',
    'add_booking': 'Nova Marcação',
    'edit_booking': 'Editar Marcação',
    'today': 'Hoje',
    'change_password': 'Alterar Palavra-passe',
    'current_password': 'Palavra-passe Atual',
    'new_password': 'Nova Palavra-passe',
    'update_password': 'Atualizar Palavra-passe',
    'service': 'Serviço',
    'date': 'Data',
    'time': 'Hora',
    'customer_name': 'Nome do Cliente',
    'name_or_walkin': 'Nome ou Walk-in',
    'phone_number': 'Número de telefone',
    'notes': 'Notas',
    'optional_notes': 'Notas opcionais',
    'delete': 'Eliminar',
    'cancel': 'Cancelar',
    'save': 'Guardar',
    'add_user': 'Novo Utilizador',
    'username': 'Utilizador',
    'role': 'Função',
    'created': 'Criado',
    'eg_john': 'ex: joao',
    'password': 'Palavra-passe',
    'min_6_chars': 'Mínimo 6 caracteres',
    'create_user': 'Criar Utilizador',
    'no_bookings_hint':
        'Sem marcações para este dia. Clique num horário ou use "Nova Marcação" para criar.',
    'walkin': 'Walk-in',
    'error_saving': 'Erro ao guardar marcação',
    'capacity_full':
        'Todos os funcionários estão ocupados neste horário. Escolha outro horário.',
    'delete_booking_confirm': 'Eliminar esta marcação?',
    'password_updated': 'Palavra-passe atualizada com sucesso',
    'error': 'Erro',
    'delete_user_confirm':
        'Eliminar utilizador "{name}"? Esta ação é irreversível.',
    'error_deleting_user': 'Erro ao eliminar utilizador',
    'error_creating_user': 'Erro ao criar utilizador',
    'day_names_full':
        ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'],

    // Vacations
    'vacations_page': 'Férias',
    'vacation_days': 'Dias de Férias',
    'vac_total': 'Total',
    'vac_used': 'Usados',
    'vac_booked': 'Marcados',
    'vac_remaining': 'Restantes',
    'vac_change': 'alteração',
    'vac_changes': 'alterações',

    // Login
    'admin_panel': 'Painel Admin',
    'sign_in_subtitle': 'Inicie sessão para gerir o seu negócio',
    'sign_in': 'Entrar',

    // Content Management
    'content_page': 'Conteúdo',
    'cnt_company_info': 'Info da Empresa',
    'cnt_about': 'Sobre',
    'cnt_services': 'Serviços',
    'cnt_gallery': 'Galeria',
    'cnt_carousel': 'Carrossel',
    'cnt_about_images': 'Imagens Sobre',
    'cnt_partners': 'Parceiros',
    'cnt_logo': 'Logo',
    'cnt_company_name': 'Nome da Empresa',
    'cnt_email': 'Email',
    'cnt_phone': 'Telefone(s)',
    'cnt_address': 'Morada',
    'cnt_schedule': 'Horário',
    'cnt_slogan': 'Slogan',
    'cnt_slogan_sub': 'Subtítulo do Slogan',
    'cnt_disclaimer': 'Aviso Legal / Rodapé',
    'cnt_add_text': 'Adicionar Texto',
    'cnt_add_service': 'Adicionar Serviço',
    'cnt_about_placeholder': 'Escreva o texto sobre nós...',
    'cnt_svc_title': 'Título',
    'cnt_svc_desc': 'Descrição',
    'cnt_svc_price': 'Preço',
    'cnt_upload': 'Carregar Imagens',
    'cnt_upload_logo': 'Carregar Logo',
    'cnt_upload_hint_gallery': 'Máx. 50 imagens, 5MB cada',
    'cnt_upload_hint_carousel': 'Máx. 10 imagens, 5MB cada',
    'cnt_upload_hint_about': 'Máx. 10 imagens, 5MB cada',
    'cnt_upload_hint_partners': 'Máx. 20 imagens, 2MB cada',
    'cnt_upload_hint_logo': '1 imagem, máx. 2MB. Substitui a existente.',
    'cnt_img_desc': 'Descrição...',
    'cnt_save_descriptions': 'Guardar Descrições',
    'cnt_delete_image': 'Eliminar esta imagem?',
    'cnt_saved': 'Guardado!',
    'cnt_deleted': 'Eliminado',
    'cnt_uploaded': 'Carregado!',
    'cnt_fill_required': 'Preencha todos os campos obrigatórios.'
  }
};

var STORAGE_KEY = 'lang';
var currentLang = localStorage.getItem(STORAGE_KEY) || 'en';

function t(key) {
  return (translations[currentLang] && translations[currentLang][key]) ||
      (translations.en[key]) || key;
}

function setLang(lang) {
  if (!translations[lang]) return;
  currentLang = lang;
  localStorage.setItem(STORAGE_KEY, lang);
  applyTranslations();
  updateToggleButtons();
  // Fire event so JS modules can react
  document.dispatchEvent(new CustomEvent('langchange', {detail: {lang: lang}}));
}

function applyTranslations() {
  // Text content
  document.querySelectorAll('[data-i18n]').forEach(function(el) {
    var key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
  // Placeholders
  document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
    var key = el.getAttribute('data-i18n-placeholder');
    el.placeholder = t(key);
  });
  // Aria labels
  document.querySelectorAll('[data-i18n-aria]').forEach(function(el) {
    var key = el.getAttribute('data-i18n-aria');
    el.setAttribute('aria-label', t(key));
  });
  // Update html lang attribute
  document.documentElement.lang = currentLang;
}

function updateToggleButtons() {
  document.querySelectorAll('.lang-btn').forEach(function(btn) {
    btn.classList.toggle(
        'active', btn.getAttribute('data-lang') === currentLang);
  });
}

function initLangToggle() {
  document.querySelectorAll('.lang-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      setLang(btn.getAttribute('data-lang'));
    });
  });
  updateToggleButtons();
  applyTranslations();
}

// Export globally
window.i18n = {
  t: t,
  setLang: setLang,
  getLang: function() {
    return currentLang;
  },
  init: initLangToggle,
  translations: translations
};
})();
