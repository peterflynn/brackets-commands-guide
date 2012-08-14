/*
 * Copyright (c) 2012 Peter Flynn.
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */


/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global define, brackets, $, setTimeout */

define(function (require, exports, module) {
    "use strict";
    
    // Brackets modules
    var CommandManager      = brackets.getModule("command/CommandManager"),
        Commands            = brackets.getModule("command/Commands"),
        KeyBindingManager   = brackets.getModule("command/KeyBindingManager"),
        Menus               = brackets.getModule("command/Menus"),
        EditorManager       = brackets.getModule("editor/EditorManager"),
        QuickOpen           = brackets.getModule("search/QuickOpen"),
        StringUtils         = brackets.getModule("utils/StringUtils");
    
    
    /** @type {Array.<{ id:string, name:string }>} */
    var _commandList;
    
    function ensureCommandList() {
        if (_commandList) {
            return;
        }
        _commandList = [];
        
        // We don't know which of these commands have no required arguments. But we can safely
        // assume that any commands attached to menus or keyboard shortcuts fit the bill.
        var ids = CommandManager.getAll();
        
        // Get list of all top-level menu bar menus
        // Ignore context menus since it seems less safe to assume those commands can be run in isolation
        var menuIds = $.map(Menus.AppMenuBar, function (menuConstVal, menuConstName) {
            return menuConstVal;
        });
        
        // Filter command list accordingly
        ids.forEach(function (id) {
            var noArgsOk = false;
            // Does it have a keybinding?
            if (KeyBindingManager.getKeyBindings(id).length > 0) {
                noArgsOk = true;
            } else {
                // Is it in the menu bar?
                menuIds.forEach(function (menuId) {
                    var menuItemId = Menus.getMenu(menuId)._getMenuItemId(id);
                    if (Menus.getMenuItem(menuItemId)) {
                        noArgsOk = true;
                    }
                });
            }
            if (noArgsOk) {
                _commandList.push({
                    id: id,
                    name: CommandManager.get(id).getName()
                });
            }
        });
    }
    
    function done() {
        // No cleanup - keep cached list of commands for next invocation
    }
    
    /**
     * @param {string} query What the user is searching for
     * @return {Array.<string>} sorted and filtered results that match the query
     */
    function search(query) {
        ensureCommandList();
        
        query = query.substr(1);  // lose the "?" prefix
        
        // TODO: filter out disabled commands?
        
        var filteredList = $.map(_commandList, function (commandInfo) {
            // Filter on search text
            var name = commandInfo.name;

            if (name.toLowerCase().indexOf(query.toLowerCase()) !== -1) {
                return commandInfo;
            }
            
        }).sort(function (a, b) {
            // Simple alphabetic sort of result list
            a = a.name.toLowerCase();
            b = b.name.toLowerCase();
            if (a > b) {
                return -1;
            } else if (a < b) {
                return 1;
            } else {
                return 0;
            }
        });

        return filteredList;
    }

    /**
     * @param {string} query What the user is searching for
     * @return {boolean} true if this plugin wants to provide results for this query
     */
    function match(query) {
        if (query.indexOf("?") === 0) {
            return true;
        }
    }

    var whichEditor;
    
    /**
     * TODO: selectedItem is currently a <LI> item from smart auto complete container. It should just be data
     * @param {HTMLLIElement} selectedItem
     */
    function itemSelect(selectedItem) {
        // Many commands are focus-sensitive, so we have to carefully make sure that focus is restored to
        // the (correct) editor before running the command
        
        // First wait for Quick Open to restore focus to the master editor
        setTimeout(function () {
            // Now set focus on the correct editor (which might be an inline editor)
            if (whichEditor) {
                whichEditor.focus();
                whichEditor = null;
            }
            
            // One more timeout to wait for focus to move to that editor
            setTimeout(function () {
                CommandManager.execute($(selectedItem).attr("data-id"));
            }, 0);
        }, 0);
    }
    
    
    function resultFormatter(item, query) {
        // Based on QuickOpen.defaultResultsFormatter(), but assuming "?" instead of "@"
        // And with some changes (noted) at very bottom
        query = query.slice(query.indexOf("?") + 1, query.length);
        
        var name = item.name;

        // Escape both query and item so the replace works properly below
        query = StringUtils.htmlEscape(query);
        name = StringUtils.htmlEscape(name);

        var displayName;
        if (query.length > 0) {
            // make the users query bold within the item's text
            displayName = name.replace(
                new RegExp(StringUtils.regexEscape(query), "gi"),
                "<strong>$&</strong>"
            );
        } else {
            displayName = name;
        }
        
        // DIFFERS from defaultResultsFormatter(): stash id and display shortcut
        // TODO: display multiple shortcuts
        // TODO: display which menu it's in also
        // TODO: display checkmark if command.getChecked() is true
        var shortcuts = KeyBindingManager.getKeyBindings(item.id);
        var shortcut = shortcuts.length ? KeyBindingManager.formatKeyDescriptor(shortcuts[0].displayKey) : "";

        return "<li data-id='" + item.id + "'>" + displayName + "<span style='float:right'>" + shortcut + "</span></li>";
    }
    
    
    // Register as a new Quick Open mode
    QuickOpen.addQuickOpenPlugin(
        {
            name: "Commands",
            fileTypes: [],  // empty array = all file types
            done: done,
            search: search,
            match: match,
            itemFocus: function () {},
            itemSelect: itemSelect,
            resultsFormatter: resultFormatter
        }
    );
    
    function handleSearchCommands() {
        whichEditor = EditorManager.getFocusedEditor();
        
        // Open Quick Open menu
        CommandManager.execute(Commands.NAVIGATE_QUICK_OPEN);
        
        // Prepopulate with "?" prefix to run it in our mode
        $("input#quickOpenSearch").val("?");
        
        // TODO: would be cleaner to just do:
        //QuickOpen.beginQuickOpen("?");
        // Assuming QuickOpen has an API like this:
        //exports.beginQuickOpen = function (prefix, initialString) { doSearch(prefix, initialString); };
    }
    

    // Register command as shortcut to launch this Quick Open mode
    var SEARCH_COMMAND_ID = "pflynn.findCommand";
    CommandManager.register("Search Commands", SEARCH_COMMAND_ID, handleSearchCommands);
    
    var menu = Menus.getMenu(Menus.AppMenuBar.NAVIGATE_MENU);
    menu.addMenuDivider();
    menu.addMenuItem(SEARCH_COMMAND_ID, {key: "Ctrl-Alt-/", displayKey: "Ctrl-Alt-?"});
});
