/*
    GNOME Shell extensions repository
    Copyright (C) 2011-2012  Jasper St. Pierre <jstpierre@mecheye.net>
    Copyright (C) 2016-2017  Yuri Konotopov <ykonotopov@gnome.org>

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
 */

define(['jquery', 'messages', 'dbus!_', 'extensionUtils', 'templates', 'paginator', 'switch'],
	function ($, messages, dbusProxy, extensionUtils, templates) {
		"use strict";

		var ExtensionState = extensionUtils.ExtensionState;

		$.fn.buildShellVersionsInfo = function () {
			return this.each(function () {
				var $table = $(this);
				var $tbody = $table.find('tbody');
				var $extension = $table.parents('.extension');

				$tbody.children().remove();

				var svm = $extension.data('svm');
				for (var version in svm)
				{
					if (!svm.hasOwnProperty(version))
					{
						continue;
					}

					var vpk = extensionUtils.grabProperExtensionVersion(svm, version);
					var $tr = $('<tr>').appendTo($tbody);
					$('<td>').append($('<code>').text(version)).appendTo($tr);
					$('<td>').text(vpk.version).appendTo($tr);
				}
			});
		};

		// While technically we shouldn't have mismatched API versions,
		// the plugin doesn't check whether the Shell matches, so if someone
		// is running with an old Shell version but a newer plugin, error out.
		if (dbusProxy.IsDummy)
		{
			// We don't have a proper DBus proxy, however API may be exported.
			// If API is exported let's assume that browser extension is installed and will handle errors.
			if(!window.SweetTooth || typeof(window.SweetTooth.initialize) !== 'function')
			{
				if (IS_CHROME || IS_FIREFOX || IS_OPERA) // browser_extension.js should be included globally
				{
					// Help user to install browser extension for supported browsers
					messages.addInfo(templates.get('messages/browser_extension')());
				}
				else
				{
					messages.addError(templates.get('messages/dummy_proxy')());
				}
			}

			$.fn.addExtensionSwitch = function () {
				// Don't show our switches -- CSS styles define a clickable
				// area even with no content.
				return this.find('.switch').hide();
			};

			$.fn.addLocalExtensions = function () {
				return this.append(templates.get('messages/cannot_list_local')());
			};

			$.fn.fillInErrors = function () {
				var $textarea = this.find('textarea[name=error]');
				var $hidden = this.find('input:hidden[name=has_errors]');
				$textarea.text(templates.get('messages/cannot_list_errors')()).addClass('no-errors').attr('disabled', 'disabled');
				$hidden.val('');
				return this;
			};

			$.fn.grayOutIfOutOfDate = function () {
				return this;
			};

			return;
		}

		// uuid => elem
		var elems = {};

		function extensionStateChanged(uuid, newState) {
			if (elems[uuid] !== undefined)
			{
				elems[uuid].trigger('state-changed', newState);
			}
		}

		function extensionTypeChanged(uuid, newType) {
			if (elems[uuid] !== undefined)
			{
				if(elems[uuid].data('type') != newType)
				{
					elems[uuid].trigger('type-changed', newState);
				}
			}
		}

		dbusProxy.extensionStateChangedHandler = extensionStateChanged;

		dbusProxy.shellRestartHandler = function () {
			dbusProxy.ListExtensions().then(function (extensions) {
				$.each(extensions, function () {
					extensionStateChanged(this.uuid, this.state);
					extensionTypeChanged(this.uuid, this.type);
				});
			});
		};

		function addExtensionSwitch(uuid, $elem, meta) {
			var $switch = $elem.find('.switch');
			var _state;
			if (meta && meta.state)
			{
				_state = meta.state;
			}
			else
			{
				_state = ExtensionState.UNINSTALLED;
			}

			$elem.find('.configure-button').on('click', function () {
				dbusProxy.LaunchExtensionPrefs(uuid);
			});

			$elem.find('.upgrade-button').on('click', function () {
				let extensionState = $elem.data('state');

				function installExtension() {
					dbusProxy.InstallExtension(uuid).then(function (result) {
						if (result === 'cancelled')
						{
							// WELP. We can't really do anything except leave the
							// thing uninstalled.
							$switch.switchify('activate', false);
						}
						// GNOME Shell bug https://bugzilla.gnome.org/show_bug.cgi?id=777544
						else if (['s', 'successful'].indexOf(result) != -1)
						{
							// It should always became "per user" extension if installed from repository.
							$elem.trigger('type-changed', extensionUtils.ExtensionType.PER_USER);

							// Disable extensions if it was disabled prior to upgrade
							if (extensionState == extensionUtils.ExtensionState.DISABLED)
							{
								dbusProxy.DisableExtension(uuid);
							}
						}
					});
				}

				$elem.removeClass('upgradable');
				if($elem.data('type') == extensionUtils.ExtensionType.PER_USER)
				{
					dbusProxy.UninstallExtension(uuid).then(function (result) {
						// If we weren't able to uninstall the extension, don't
						// do anything more.
						if (!result)
						{
							return;
						}

						installExtension();
					});
				}
				else
				{
					dbusProxy.DisableExtension(uuid).then(function (result) {
						// Install extension if we were able to disable it first
						if(result)
						{
							installExtension();
						}
					});
				}
			});

			$elem.find('.uninstall-button').on('click', function () {
				dbusProxy.UninstallExtension(uuid).then(function (result) {
					if (result)
					{
						$elem.fadeOut({queue: false}).slideUp({queue: false});
						messages.addInfo(templates.get('extensions/uninstall')(meta));
					}
				});
			});

			if ([ExtensionState.UNINSTALLED, ExtensionState.DOWNLOADING].indexOf(_state) == -1)
			{
				$elem.addClass('installed');
			}

			if(meta.type == extensionUtils.ExtensionType.SYSTEM)
			{
				$elem.addClass('system');
			}

			$elem.data({
				'elem': $elem,
				'state': _state,
				'type': meta.type
			});

			$switch.data('elem', $elem);
			$switch.switchify();

			var svm = meta.shell_version_map || $elem.data('svm');
			var latest = extensionUtils.grabProperExtensionVersion(
				svm,
				dbusProxy.ShellVersion,
				!dbusProxy.VersionValidationEnabled
			);

			if (_state !== ExtensionState.UNINSTALLED && latest !== null &&
				(!meta.version || latest.version > meta.version || _state === ExtensionState.OUT_OF_DATE))
			{
				$elem.addClass('upgradable');
			}

			function sendPopularity(action) {
				$.ajax({
					url: '/ajax/adjust-popularity/',
					type: 'POST',
					data: {
						uuid: uuid,
						action: action
					}
				});
			}

			// When the user flips the switch...
			$switch.on('changed', function (e, newValue) {
				var oldState = $elem.data('state');
				if (newValue)
				{
					if (oldState == ExtensionState.UNINSTALLED)
					{
						// If the extension is uninstalled and we
						// flick the switch on, install.
						dbusProxy.InstallExtension(uuid).then(function (result) {
							if (result === 'succeeded')
							{
								sendPopularity('enable');
							}
							else if (result === 'cancelled')
							{
								$switch.switchify('activate', false);
							}
						});
					}
					else if (oldState == ExtensionState.DISABLED ||
						oldState == ExtensionState.INITIALIZED)
					{
						dbusProxy.EnableExtension(uuid);
						sendPopularity('enable');
					}
				}
				else
				{
					if (oldState == ExtensionState.ENABLED)
					{
						dbusProxy.DisableExtension(uuid);
						sendPopularity('disable');
					}
				}
			});

			// When the extension changes state...
			$elem.on('state-changed', function (e, newState) {
				$elem.data('state', newState);

				var hasPrefs = !!(meta.hasPrefs && newState !== ExtensionState.OUT_OF_DATE);
				$elem.toggleClass('configurable', hasPrefs);

				if (newState == ExtensionState.DISABLED ||
					newState == ExtensionState.INITIALIZED ||
					newState == ExtensionState.UNINSTALLED)
				{
					// Remove customization
					$switch.switchify('customize');
					$switch.switchify('activate', false);
					$elem.removeClass('out-of-date');

					if(newState == ExtensionState.UNINSTALLED && !latest)
					{
						$switch.switchify(
							'customize',
							"INCOMPATIBLE",
							'incompatible',
							"This extension is incompatible with your GNOME Shell version. For GNOME Shell 3.12 " +
							" or newer you can set \"disable-extension-version-validation\" dconf setting to true" +
							" to force installation of incompatible extensions."
						);
					}
				}
				else if (newState == ExtensionState.ENABLED)
				{
					// Remove customization
					$switch.switchify('customize');
					$switch.switchify('activate', true);
					$elem.removeClass('out-of-date');
				}
				else if (newState == ExtensionState.ERROR)
				{
					$switch.switchify('customize', "ERROR", 'error');
				}
				else if (newState == ExtensionState.OUT_OF_DATE)
				{
					$elem.addClass('out-of-date');
					$switch.switchify('customize', "OUTDATED", 'outdated');
				}
			});

			$elem.on('type-changed', function (e, newType) {
				if(newType == extensionUtils.ExtensionType.SYSTEM)
				{
					$elem.addClass('system');
				}
				else
				{
					$elem.removeClass('system');
				}

				$elem.data('type', newType);
			});

			$elem.trigger('state-changed', _state);
			elems[uuid] = $elem;
		}

		$.fn.addLocalExtensions = function () {
			return this.each(function () {
				var $container = $(this);
				dbusProxy.ListExtensions().then(function (extensions) {
					if (extensions && !$.isEmptyObject(extensions))
					{
						var extensionValues = [];
						for (var uuid in extensions)
						{
							extensionValues.push(extensions[uuid]);
						}

						extensionValues.sort(function (a, b) {
							if (a.name === undefined)
							{
								return 0;
							}

							if (b.name === undefined)
							{
								return 0;
							}

							return a.name.localeCompare(b.name);
						});

						extensionValues.forEach(function (extension) {
							var uuid = extension.uuid;

							// Give us a dummy element that we'll replace when
							// rendering below, to keep renderExtension simple.
							var $elem = $('<a>');

							function renderExtension() {
								if (extension.type == extensionUtils.ExtensionType.SYSTEM)
								{
									extension.system = true;
								}

								if (extension.description)
								{
									extension.first_line_of_description = extension.description.split('\n')[0];
								}

								$elem = $(templates.get('extensions/info')(extension)).replaceAll($elem);

								addExtensionSwitch(uuid, $elem, extension);
							}

							$.ajax({
								url: "/ajax/detail/",
								dataType: "json",
								data: {
									uuid: extension.uuid,
									version: extension.version
								},
								type: "GET",
							}).done(function (result) {
								$.extend(extension, result);
								renderExtension();
							}).fail(function (error) {
								// Had an error looking up the data for the
								// extension -- that's OK, just render it anyway.
								renderExtension();
							});

							$container.append($elem);
						});
					}
					else
					{
						$container.append("You don't have any extensions installed.");
					}
				})
			});
		};

		$.fn.fillInErrors = function () {
			return this.each(function () {
				var $form = $(this);
				var uuid = $form.data('uuid');
				var $textarea = $form.find('textarea');
				dbusProxy.GetExtensionInfo(uuid).then(function (meta) {
					dbusProxy.GetErrors($form.data('uuid')).then(function (errors) {
						var context = {
							sv: dbusProxy.ShellVersion,
							ev: (meta && meta.version) ? meta.version : null,
							errors: errors
						};

						$textarea.text(templates.get('extensions/error_report_template')(context));
					});
				});
			});
		};

		$.fn.addExtensionSwitch = function () {
			return this.each(function () {
				var $extension = $(this);
				var uuid = $extension.data('uuid');

				$extension.on('out-of-date', function () {
					var svm = $extension.data('svm');
					var nhvOperation = extensionUtils.findNextHighestVersion(svm, dbusProxy.ShellVersion);
					if (nhvOperation.operation === 'upgrade' &&
						nhvOperation.stability === 'stable')
					{
						messages.addError("This extension is incompatible with your version of GNOME. Please upgrade to GNOME " + nhvOperation.version);
					}
					else if (nhvOperation.operation === 'upgrade' &&
						nhvOperation.stability === 'unstable')
					{
						messages.addError("This extension is incompatible with your version of GNOME. This extension supports the GNOME unstable release, " + nhvOperation.version);
					}
					else if (nhvOperation.operation === 'downgrade')
					{
						messages.addError("This extension is incompatible with your version of GNOME.");
					}
				});

				dbusProxy.GetExtensionInfo(uuid).then(function (meta) {
					addExtensionSwitch(uuid, $extension, meta);
				});
			});
		};

		$.fn.grayOutIfOutOfDate = function () {
			return this.each(function () {
				var $elem = $(this);
				var svm = $elem.data('svm');
				if (!svm)
				{
					return;
				}

				var vpk = extensionUtils.grabProperExtensionVersion(
					svm,
					dbusProxy.ShellVersion,
					!dbusProxy.VersionValidationEnabled
				);
				if (vpk === null)
				{
					$elem.addClass('out-of-date');
				}
			});
		};
	}
);
