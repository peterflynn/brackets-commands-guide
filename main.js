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
    
    /**
     * Editor that should be focused when executing the command (that had focus before opening search bar)
     * @type {Editor}
     */
    var whichEditor;
    
    
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
                    var menu = Menus.getMenu(menuId);
                    var menuItemId = menu && menu._getMenuItemId(id);
                    if (Menus.getMenuItem(menuItemId)) {
                        noArgsOk = true;
                    }
                });
            }
            if (noArgsOk) {
                _commandList.push({
                    id: id,
                    name: CommandManager.get(id).getName()
                    // (getName() undefined for CommandManager.registerInternal(), but those commands should have been filtered out above anyway)
                });
            }
        });
    }
    
    function done() {
        // No cleanup - keep cached list of commands for next invocation
    }
    
    /**
     * @param {string} query User query/filter string
     * @return {Array.<string>} Sorted and filtered results that match the query
     */
    function search(query, matcher) {
        ensureCommandList();
        
        query = query.substr(1);  // lose the "?" prefix
        
        var stringMatch = (matcher && matcher.match) ? matcher.match.bind(matcher) : QuickOpen.stringMatch;
        
        // Filter and rank how good each match is
        var filteredList = $.map(_commandList, function (commandInfo) {
            
            // TODO: filter out disabled commands?
            
            var searchResult = stringMatch(commandInfo.name, query);
            if (searchResult) {
                searchResult.id = commandInfo.id;
            }
            return searchResult;
        });
        
        // Sort based on ranking & basic alphabetical order
        QuickOpen.basicMatchSort(filteredList);

        return filteredList;
    }

    /**
     * @param {string} query
     * @return {boolean} true if this plugin wants to provide results for this query
     */
    function match(query) {
        if (query.indexOf("?") === 0) {
            return true;
        }
    }

    /**
     * @param {SearchResult} selectedItem
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
                CommandManager.execute(selectedItem.id);
            }, 0);
        }, 0);
    }
    
    
    /**
     * Similar to default formatting, but with added text showing keybinding
     * 
     * @param {SearchResult} fileEntry
     * @param {string} query
     * @return {string}
     */
    function resultFormatter(item, query) {
        var displayName = QuickOpen.highlightMatch(item);
        
        // Show shortcut on right of item
        // TODO: display multiple shortcuts
        // TODO: display which menu it's in also
        // TODO: display checkmark if command.getChecked() is true
        var shortcuts = KeyBindingManager.getKeyBindings(item.id);
        var shortcut = shortcuts.length ? KeyBindingManager.formatKeyDescriptor(shortcuts[0].displayKey) : "";

        return "<li>" + displayName + "<span style='float:right'>" + shortcut + "</span></li>";
    }
    
    
    // Register as a new Quick Open mode
    QuickOpen.addQuickOpenPlugin(
        {
            name: "Commands",
            label: "Commands",  // ignored before Sprint 34
            languageIds: [],  // empty array = all file types  (Sprint 23+)
            fileTypes:   [],  // (< Sprint 23)
            done: done,
            search: search,
            match: match,
            itemFocus: function () {},
            itemSelect: itemSelect,
            resultsFormatter: resultFormatter
        }
    );
    
    function beginSearchForCommands() {
        whichEditor = EditorManager.getFocusedEditor();
        
        // Begin Quick Open in our search mode
        QuickOpen.beginSearch("?");
    }
    

    // Register command as shortcut to launch this Quick Open mode
    var SEARCH_COMMAND_ID = "pflynn.searchCommands";
    CommandManager.register("Search Commands", SEARCH_COMMAND_ID, beginSearchForCommands);
    
    var menu = Menus.getMenu(Menus.AppMenuBar.HELP_MENU);
    menu.addMenuDivider(Menus.FIRST);
    menu.addMenuItem(SEARCH_COMMAND_ID, [
        {key: "Ctrl-Alt-/", displayKey: "Ctrl-Alt-?", platform: "win"},
        {key: "Ctrl-Cmd-/", displayKey: "Ctrl-Cmd-?", platform: "mac"}
    ], Menus.FIRST);
});
