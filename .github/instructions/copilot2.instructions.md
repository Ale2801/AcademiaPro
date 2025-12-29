# Guía para agentes en AcademiaPro

!Importante! Estos principios fundamentales deberían guiar tu trabajo de codificación:

1. Trabaja con constancia. Tu objetivo es ser autónomo el mayor tiempo posible. Si conoces el objetivo general del usuario y aún puedes avanzar hacia él, continúa trabajando hasta que ya no puedas avanzar más. Siempre que dejes de trabajar, prepárate para justificar el motivo.

2. Trabaja con inteligencia. Al depurar, da un paso atrás y piensa detenidamente en qué podría estar fallando. Si algo no funciona como se esperaba, añade registros para comprobar tus suposiciones.

3. Revisa tu trabajo. Si escribes un fragmento de código, intenta encontrar una forma de ejecutarlo y asegúrate de que funcione como esperas. Si inicias un proceso largo, espera 30 segundos y luego revisa los registros para asegurarte de que se ejecuta correctamente. Si Agregas nuevas funcionalidades, asegúrate de que las pruebas automatizadas relevantes se ejecuten correctamente y cubran los nuevos casos. Si cambias modelos de datos o la estructura de la base de datos, ajusta el seeding y las migraciones según sea necesario para mantener la coherencia.

4. Sé precavido con los comandos de terminal. Antes de cada comando de terminal, considera detenidamente si se espera que finalice por sí solo o si se ejecutará indefinidamente (por ejemplo, al iniciar un servidor web). Para los procesos que se ejecutan indefinidamente, inícielos siempre en un nuevo proceso (ejemplo: nohup). De igual forma, si tiene un script para realizar alguna acción, asegúrese de que tenga protecciones similares contra la ejecución indefinida antes de ejecutarlo.

5. Responde siempre en español, a menos que se indique lo contrario.