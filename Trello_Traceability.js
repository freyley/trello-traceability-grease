// ==UserScript==
// @name         Trello Traceability
// @namespace    trellotraceability
// @version      2.0
// @description  Link and unlink cards between boards in Trello
// @author       Jeff Schwaber
// @match        https://trello.com/*
// @require http://ajax.googleapis.com/ajax/libs/jquery/2.2.2/jquery.min.js
// @require https://raw.githubusercontent.com/js-cookie/js-cookie/master/src/js.cookie.js
// @grant        none
// ==/UserScript==
/* jshint -W097 */
'use strict';

var __new_quick_action_button = $("<a class='quick-card-editor-buttons-item js-link-item' href='#'><span class='icon-sm icon-label light'></span><span class='quick-card-editor-buttons-item-text'>Link Item</span></a>");
var __xx_add_link_button_to_quick_actions = function() {
    $('.js-open-quick-card-editor').click(function(evt) {
        window.setTimeout(function() {
            window.menu_button = $(evt.target);
            window.editor_buttons = $('.quick-card-editor-buttons');
            $('.quick-card-editor-buttons').append(__new_quick_actoin_button);
        }, 0.1);
    });
};

var get_card_id = function() {
   return window.location.pathname.split('/')[2];
}

var _get_org_for_card = function(card_id){
    return $.get('https://trello.com/1/cards/' + card_id + '/board').pipe(function(p){
        return p.idOrganization;
    });
};

var _get_boards_for_org = function(org_id) {
    return $.get('https://trello.com/1/organizations/' + org_id + '/boards?filter=open').pipe(function(p){
        return p;
    });
};

var get_lists_for_board = function(board_id) {
    return $.get('https://trello.com/1/boards/' + board_id + '/lists');
};

var get_boards_for_card = function(card_id) {
    return _get_org_for_card(card_id)
           .pipe(_get_boards_for_org);  
};

var get_cards_for_list = function(list_id) {
    return $.get('https://trello.com/1/lists/'+list_id + '/cards');
};

var get_long_card_id_for_short = function(card_id) {
    var deferred = new $.Deferred();
    $.get('https://trello.com/1/cards/' + card_id).done(function(card) {
        deferred.resolve(card.id);
    });
    return deferred;
};
var get_or_create_links_checklist_for_card = function(card_id) {
    var deferred = new $.Deferred();
    var existing_found = false;

    $.get('https://trello.com/1/cards/'+card_id+'/checklists').done(function(checklists) {
        for (var i=0; i<checklists.length; i++) {
            var checklist = checklists[i];            
            if (checklist.name === 'Links') {
                existing_found = true;
                deferred.resolve(checklist.id);
            }
        }
        if (! existing_found) {
            $.post('https://trello.com/1/checklists', {idCard: card_id, name: 'Links', token: Cookies.get('token')}).done(function(data) {
                deferred.resolve(data.id)
            });
        }
    });
    return deferred;
};        

var find_card_in_checklist = function(card_url, checklist_id) {
    var deferred = new $.Deferred();
    $.get('https://trello.com/1/checklists/'+checklist_id+'/checkItems').done(function(checkitems) {
        var found = false;
        for (var i=0; i<checkitems.length; i++) {
            var checkitem = checkitems[i];
            if(checkitem.name.indexOf(card_url) === 0) {
                found = true;
                deferred.resolve(checkitem);
            }
        }
        if (!found) {
            deferred.resolve({});
        }
    });
    return deferred;
};

var get_card_url = function(card_id) {
    var deferred = new $.Deferred();
    $.get('https://trello.com/1/cards/'+card_id+'?fields=shortUrl').done(function(card_data) {
        deferred.resolve(card_data.shortUrl);
    });
    return deferred;
};
var get_or_create_card_in_checklist = function(card_id, checklist_id) {
    var deferred = new $.Deferred();
    get_card_url(card_id).done(function(card_url) {
        find_card_in_checklist(card_url, checklist_id).done(function(checkitem) {
            if (checkitem.id) {
                deferred.resolve(checkitem);
            } else {
                $.post('https://trello.com/1/checklists/'+checklist_id+'/checkItems', {name: card_url, token: Cookies.get('token')}).done(function(new_checkitem) {
                    deferred.resolve(new_checkitem);
                });
            }
        });
    });
    return deferred;
};

var refresh_checkitems = function(card_id, checklist_id) {
    $.get('https://trello.com/1/checklists/'+checklist_id+'/checkItems').done(function(checkitems) {
        for (var i=0; i<checkitems.length; i++) {
            var checkitem = checkitems[i];
            $.get('https://trello.com/1/cards/'+card_id+'?fields=shortUrl,list&list=true').done(function(card_data) {
                var list_name = card_data.list.name;
                var card_url = card_data.shortUrl;
                var new_name = card_url + ' [' + list_name +']';
                console.log(list_name, card_url, new_name);
                $.ajax(
                    'https://trello.com/1/cards/'+card_id+'/checklist/'+checklist_id+'/checkItem/'+checkitem.id, 
                    { type: 'PUT', data: {'name': new_name, 'token': Cookies.get('token')}}
                ).done(function() {});
            });
        }
    });
};
        
    

  

var CURRENTLY_SELECTED_BOARD = null;
var CURRENTLY_SELECTED_LIST = null;
var CURRENTLY_SELECTED_CARD = null;

var clear_link_dialog = function() {
    CURRENTLY_SELECTED_BOARD = null;    
    CURRENTLY_SELECTED_LIST = null;    
    CURRENTLY_SELECTED_CARD = null;    
    $('#link-dialog').hide();
};


var add_link_dialog_to_page = function() {
    var dialog_html = '<div id="link-dialog" class="pop-over is-shown" style="display: none">\
       <div>\
          <div class="pop-over-header js-pop-over-header">\
              <span class="pop-over-header-title">Link</span>\
              <a href="#" class="pop-over-header-close-btn icon-sm icon-close"></a>\
          </div>\
       <div>\
          <div class="pop-over-content js-pop-over-content u-fancy-scrollbar js-tab-parent" style="max-height: 530px;">\
          <div>\
              <div>\
                  <div class="form-grid">\
                      <div class="button-link setting form-grid-child form-grid-child-full">\
                      <span class="label">Board</span><span class="value js-board-value">Current Iteration</span><label>Board</label>\
                          <select class="js-select-board"></select>\
                      </div>\
                  </div>\
              <div class="form-grid">\
                  <div class="button-link setting form-grid-child form-grid-child-full">\
                      <span class="label">List</span><span class="value js-list-value">to do</span>\
                      <label>List</label><select class="js-select-list"></select>\
                   </div>\
              </div>\
              <div class="form-grid">\
                   <div class="button-link setting form-grid-child form-grid-child-full">\
                       <span class="label">Card</span><span class="value js-card-value">Foobar</span>\
                       <label>Card</label><select class="js-select-card"></select>\
                   </div>\
              </div>\
          <input class="primary wide js-submit" type="submit" value="Link">\
    </div></div></div></div></div></div>'
    $('body').append(dialog_html);
    $('#link-dialog a.icon-close').click(function() {
        clear_link_dialog();
    });
    $(document).keydown(function(e){
        // todo: figure out how to keep the card from taking the 'escape' as well and quitting too
        if ($('#link-dialog').is(':visible')) {
            if(e.keyCode === 27)
                clear_link_dialog();
        }
    });
    $('#link-dialog select.js-select-board').change(function() {
        var selected_board = $('#link-dialog select.js-select-board').find('option:selected')
        var text = selected_board.text()
        CURRENTLY_SELECTED_BOARD = selected_board.attr('board_id');
        $('#link-dialog span.js-board-value').html(text);
        get_lists_for_board(CURRENTLY_SELECTED_BOARD).done(function(data) {
            $('#link-dialog .js-select-list').empty();
            for (var i=0; i<data.length; i++) {
                var elem = data[i];
                if (i===0) {
                    $('#link-dialog span.js-list-value').html(elem.name);
                }
                $('#link-dialog .js-select-list').append('<option list_id="'+elem.id+'">'+elem.name+'</option>');
                
            }
        });
    });
    $('#link-dialog select.js-select-list').change(function() { 
        var selected_list = $('#link-dialog select.js-select-list').find('option:selected');
        var text = selected_list.text()
        CURRENTLY_SELECTED_LIST = selected_list.attr('list_id');
        $('#link-dialog span.js-list-value').html(text);
        get_cards_for_list(CURRENTLY_SELECTED_LIST).done(function(data) {
            $('#link-dialog .js-select-card').empty();
            for (var i=0; i<data.length; i++) {
                var elem = data[i];
                if (i===0) {
                    $('#link-dialog span.js-card-value').html(elem.name);
                }
                console.log(elem);
                $('#link-dialog .js-select-card').append('<option card_id="'+elem.id+'">'+elem.name+'</option>');
                
            }
        });
    });
    $('#link-dialog select.js-select-card').change(function() { 
        var selected_card = $('#link-dialog select.js-select-card').find('option:selected');
        var text = selected_card.text()
        CURRENTLY_SELECTED_CARD = selected_card.attr('card_id');
        $('#link-dialog span.js-card-value').html(text);
    });
    
    $('#link-dialog .js-submit').click(function() {
        var card_id = get_card_id();
        var long_card_id = null;
        get_long_card_id_for_short(card_id).done(function(lci) {    
            long_card_id = lci;
            get_or_create_links_checklist_for_card(long_card_id).done(function(checklist_id) {
                get_or_create_card_in_checklist(CURRENTLY_SELECTED_CARD, checklist_id);
            });
        });
        get_or_create_links_checklist_for_card(CURRENTLY_SELECTED_CARD).done(function(checklist_id) {
                get_or_create_card_in_checklist(long_card_id, checklist_id);
        });

    });
};


var new_card_back_button = '<a class="button-link js-link" href="#"><span class="icon-sm icon-attachment"></span> Link</a>';
var add_link_button_to_card_back = function() {
    $('a.js-attach').after(new_card_back_button);
    $('a.js-link').click(function(evt) {
        $('#link-dialog').css({left: '853px', top: '206px', position: 'absolute'});
        $('#link-dialog').show();
        var card_id = get_card_id();
        get_boards_for_card(card_id).done(function(data) {
            $('#link-dialog .js-select-board').empty();
            for (var i=0; i<data.length; i++) {
                var elem = data[i];
                $('#link-dialog .js-select-board').append('<option board_id="'+elem.id+'">'+elem.name+'</option>');
            }
        });
            
        return false;
    });    
};
var add_refresh_to_card_back = function() {
    $('.window-module-title-options').prepend('<a class="js-tt-refresh" href="#">Refresh</a> ');
    $('.js-tt-refresh').click(function() {
       var card_id = get_card_id();
       get_long_card_id_for_short(card_id).done(function(long_card_id) {    
            get_or_create_links_checklist_for_card(long_card_id).done(function(checklist_id) {
                refresh_checkitems(long_card_id, checklist_id);
            });
       });
       return false;
    });
};

$(function() {
    // TODO: ideally, run this initially only if the url is trello.com/c/...
    add_link_dialog_to_page();
    add_link_button_to_card_back();
    $('.list-card-details').on('click', function(e){
        window.setTimeout(add_link_button_to_card_back, 1);
        window.setTimeout(add_refresh_to_card_back, 1);
    });
});
