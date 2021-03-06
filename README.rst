==============
SweetTooth-Web
==============

**SweetTooth-Web** is a Django-powered web application that, in co-operation
with some GNOME Shell integration helper (`NPAPI plugin`_ or `Browser extension`_)
allows users to install, upgrade and enable/disable their own Shell Extensions.
All operations with the Shell are done through a special helper which proxies
over to the Shell by DBus.

Since extensions can be dangerous, all extensions uploaded to the repository
must go through code review and testing.

.. _NPAPI plugin: http://git.gnome.org/browse/gnome-shell/tree/browser-plugin
.. _Browser extension: https://git.gnome.org/browse/chrome-gnome-shell/

Getting Started
---------------

You can get started developing the website with::

  $ git clone https://git.gnome.org/browse/extensions-web
  $ cd extensions-web
  $ virtualenv --system-site-packages ./venv

I use `--system-site-packages` because we require Xapian, which doesn't have
its Python bindings in PyPI.
::

  $ . ./venv/bin/activate
  $ pip install -r ../requirements.txt
  $ python manage.py syncdb

You should be asked to create superuser account. Provide some login and password.
::

  $ python manage.py migrate

After above steps your database should be initialized and almost ready to run.
You should manualy specify your site's domain with SQL update::

  UPDATE `django_site`
  SET `domain` = 'your.domain.name',
      `name` = 'your.domain.name'
  WHERE `django_site`.`id` = 1;

Create file "local_settings.py" with line "Debug = True". Then start your website:
::

  $ python manage.py runserver

Log in using superuser account. You should be able to upload and review extensions.

.. _virtualenv: http://www.virtualenv.org/
.. _pip: http://www.pip-installer.org/

Testing with the Shell
======================

If you have GNOME Shell, and you want to test the installation system, you're
going to have to hack your system. For security reasons, the browser plugin and
GNOME Shell both ping the URL https://extensions.gnome.org directly. The
easiest way to get around this is to make a development environment with the
proper things that it needs. Since the Django development server doesn't
natively support SSL connections, we need to install Apache. Follow the
instructions above to get a proper SweetTooth checkout, and then::

  # Install Apache
  $ sudo yum install httpd mod_wsgi mod_ssl

  # Generate a self-signed cert
  $ openssl req -new -nodes -out ego.csr -keyout extensions.gnome.org.key
  # Answer questions. The only one required is the Common Name. You must put
  # extensions.gnome.org -- the hostname -- as the answer.

  $ openssl x509 -req -in ego.csr -signkey extensions.gnome.org.key -out extensions.gnome.org.crt
  $ rm ego.csr
  $ chmod 600 extensions.gnome.org.key

  # Install it on your system.
  $ sudo cp extensions.gnome.org.crt /etc/pki/tls/certs/
  $ sudo cp --preserve=mode extensions.gnome.org.key /etc/pki/tls/private/

  # The shell will look for a special file called 'extensions.gnome.org.crt',
  # for development purposes. Otherwise it will use your system's CA bundle.
  $ mkdir -p ~/.local/share/gnome-shell
  $ cp extensions.gnome.org.crt ~/.local/share/gnome-shell/

  # Configure Apache.
  $ cp etc/sweettooth.wsgi.example ./sweettooth.wsgi
  $ $EDITOR ./sweettooth.wsgi

  $ cp etc/sweettooth.httpd.conf.example ./sweettooth.httpd.conf
  $ $EDITOR ./sweettooth.httpd.conf
  $ sudo cp sweettooth.httpd.conf /etc/httpd/conf.d/sweettooth.conf

  # Edit /etc/hosts
  $ sudo tee -a /etc/hosts <<< 'extensions.gnome.org 127.0.0.1'


Requirements
------------

  * django_
  * django-autoslug_
  * Pygments_
  * django-registration_
  * xapian_
  * pillow_

.. _django: http://www.djangoproject.com/
.. _django-autoslug: http://packages.python.org/django-autoslug/
.. _Pygments: http://www.pygments.org/
.. _south: http://south.aeracode.org/
.. _django-registration: http://pypi.python.org/pypi/django-registration
.. _xapian: http://www.xapian.org/
.. _pillow: https://github.com/python-pillow/Pillow
