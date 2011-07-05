(function($) {
    var SweetTooth = window.SweetTooth = {};

    SweetTooth.ExtensionState = {
        // These constants should be kept in sync
        // with those in gnome-shell: see js/ui/extensionSystem.js
        ENABLED: 1,
        DISABLED: 2,
        ERROR: 3,
        OUT_OF_DATE: 4,
        DOWNLOADING: 5,

        // Not a real state, used when there's no extension
        // with the associated UUID in the extension map.
        UNINSTALLED: 99
    };

    SweetTooth.DBusProxyInterfaces = {
        Available: []
    };

    SweetTooth.Messages = {
        addMessage: function(tag, message) {
            $('#message_container').append(
                $('<p>')
                    .addClass('message')
                    .addClass(tag)
                    .text(message));
        },

        addError: function(message) {
            return SweetTooth.Messages.addMessage('error', message);
        }
    };

    $.fn.loginPopupify = function(form) {
        var elem = $(this);
        elem.click(function(event) {
            elem.toggleClass('selected');
            $(form).slideToggle();
            return false;
        });
    };
})(jQuery);
